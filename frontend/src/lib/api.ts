export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public errors: FieldError[] = [],
  ) {
    super(detail);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function toQueryString(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}${toQueryString(query)}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Check your connection and try again.");
  }
  if (response.status === 401 && !path.startsWith("/auth/login") && typeof window !== "undefined") {
    if (window.location.pathname !== "/login") {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }
  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    let errors: FieldError[] = [];
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      if (Array.isArray(data.errors)) errors = data.errors;
    } catch {
      /* non-JSON error body (e.g. a proxy error page) */
    }
    throw new ApiError(response.status, detail, errors);
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, body ?? {}, query),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, query?: Query) => request<T>("DELETE", path, undefined, query),
};

/** Backend file download URL (used for JSON / BIND export). */
export function exportUrl(zoneId: string, format: "json" | "bind"): string {
  return `/api/hosted-zones/${zoneId}/export${toQueryString({ format })}`;
}
