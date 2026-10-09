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
      // The custom header is the CSRF defence: cross-site requests cannot add it without a CORS preflight.
      headers: { "X-Requested-With": "fetch", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Check your connection and try again.");
  }
  if (response.status === 401 && !path.startsWith("/auth/login") && typeof window !== "undefined") {
    if (window.location.pathname !== "/login") {
      // Hard navigation on purpose: it also drops all client caches of the expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
  delete: <T>(path: string, query?: Query, body?: unknown) => request<T>("DELETE", path, body, query),
};

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * POSTs JSON and reads a server-sent-events response, calling `onEvent` for every event as it arrives.
 * Works when a proxy buffers the stream too: the events are then delivered together at the end.
 */
export async function streamPost(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Requested-With": "fetch", "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Unable to reach the server. Check your connection and try again.");
  }
  if (!response.ok || !response.body) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (response.status === 401 && typeof window !== "undefined") window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    let detail = "Something went wrong. Please try again.";
    let errors: FieldError[] = [];
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      if (Array.isArray(data.errors)) errors = data.errors;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, detail, errors);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    try {
      onEvent({ event, data: JSON.parse(data.join("\n")) as Record<string, unknown> });
    } catch {
      /* ignore malformed events */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const separator = buffer.slice(index).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
      flush(buffer.slice(0, index));
      buffer = buffer.slice(index + separator);
    }
  }
  if (buffer.trim()) flush(buffer);
}

/** Backend file download URL (used for JSON / BIND export). */
export function exportUrl(zoneId: string, format: "json" | "bind"): string {
  return `/api/hosted-zones/${zoneId}/export${toQueryString({ format })}`;
}
