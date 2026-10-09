/**
 * Client-side DNS validation. Mirrors backend/app/dns/validators.py so users get instant
 * feedback; the backend remains the source of truth and re-validates everything.
 * Each validator returns an error message, or null when the value is valid.
 */

const LABEL_RE = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/;
const MAX_NAME = 253;
const MAX_LABEL = 63;
export const MAX_TTL = 2147483647;
export const CAA_TAGS = ["issue", "issuewild", "iodef"] as const;

export function checkLabels(labels: string[], allowWildcard: boolean, what: string): string | null {
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (!label) return `${what} contains an empty label (consecutive dots).`;
    if (label.length > MAX_LABEL) return `Labels cannot be longer than ${MAX_LABEL} characters.`;
    if (label === "*") {
      if (!allowWildcard || i !== 0) return "A wildcard (*) is only allowed as the entire leftmost label.";
      continue;
    }
    if (!LABEL_RE.test(label)) {
      return `Label '${label}' is invalid. Use letters, digits, hyphens or underscores; labels cannot start or end with a hyphen.`;
    }
  }
  return null;
}

export function validateZoneName(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (!name) return "Domain name is required.";
  if (name.length > MAX_NAME) return `Domain name cannot exceed ${MAX_NAME} characters.`;
  const labels = name.split(".");
  if (labels.length < 2) return "Domain name must contain at least two labels, for example example.com.";
  const err = checkLabels(labels, false, "Domain name");
  if (err) return err;
  if (/^\d+$/.test(labels[labels.length - 1])) return "The top-level label of a domain name cannot be numeric.";
  return null;
}

/** Validates the record-name portion typed by the user (relative to the zone). */
export function validateRecordName(raw: string, zoneName: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "@") return null;
  const zone = zoneName.toLowerCase();
  const absolute = value.endsWith(".");
  const base = value.replace(/\.+$/, "");
  let fqdn: string;
  if (absolute) fqdn = base;
  else if (base === zone || base.endsWith(`.${zone}`)) fqdn = base;
  else fqdn = `${base}.${zone}`;
  if (fqdn.length > MAX_NAME) return `Record name cannot exceed ${MAX_NAME} characters.`;
  const err = checkLabels(fqdn.split("."), true, "Record name");
  if (err) return err;
  if (fqdn !== zone && !fqdn.endsWith(`.${zone}`)) return `Record name must end with the hosted zone name '${zone}'.`;
  return null;
}

export function validateHostname(raw: string, field = "Value"): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return `${field} must not be empty.`;
  if (value === ".") return null;
  const base = value.replace(/\.+$/, "");
  if (base.length > MAX_NAME) return `${field} cannot exceed ${MAX_NAME} characters.`;
  return checkLabels(base.split("."), false, field);
}

export function validateIPv4(raw: string): string | null {
  const v = raw.trim();
  const parts = v.split(".");
  const ok = parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
  return ok ? null : `'${v}' is not a valid IPv4 address (example: 192.0.2.44).`;
}

export function validateIPv6(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const msg = `'${v}' is not a valid IPv6 address (example: 2001:db8::1).`;
  if (!v || /[^0-9a-f:.]/.test(v)) return msg;
  const halves = v.split("::");
  if (halves.length > 2) return msg;
  const split = (s: string) => (s === "" ? [] : s.split(":"));
  const groups = [...split(halves[0]), ...(halves.length === 2 ? split(halves[1]) : [])];
  let units = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.includes(".")) {
      if (i !== groups.length - 1 || validateIPv4(g)) return msg;
      units += 2;
    } else if (/^[0-9a-f]{1,4}$/.test(g)) {
      units += 1;
    } else {
      return msg;
    }
  }
  return (halves.length === 2 ? units <= 7 : units === 8) ? null : msg;
}

export function validateTtl(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return `TTL must be a whole number between 0 and ${MAX_TTL}.`;
  return Number(text) > MAX_TTL ? `TTL must be between 0 and ${MAX_TTL} seconds.` : null;
}

export function validateInt(value: unknown, name: string, low: number, high: number): string | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return `${name} must be a whole number between ${low} and ${high}.`;
  const n = Number(text);
  return n < low || n > high ? `${name} must be between ${low} and ${high}.` : null;
}

/** TXT: either raw text, or one-or-more "quoted" strings (max 255 chars each). */
export function validateTxt(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "TXT value must not be empty.";
  if (!text.startsWith('"')) return null; // raw text is auto-quoted and split by the server
  const strings: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    if (text[i] !== '"') return 'Each TXT string must be enclosed in double quotes, e.g. "v=spf1 -all" "second string".';
    i++;
    let buf = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && i + 1 < text.length) i++;
      buf += text[i++];
    }
    if (i >= text.length) return "TXT value has an unterminated double quote.";
    i++;
    strings.push(buf);
  }
  return strings.some((s) => s.length > 255) ? "Each quoted TXT string can contain at most 255 characters." : null;
}

export function validateCaaValue(value: string): string | null {
  const v = value.trim().replace(/^"(.*)"$/, "$1");
  if (!v) return "CAA value must not be empty.";
  return v.includes('"') ? "CAA value cannot contain double quotes." : null;
}

/** CIDR block check: valid IPv4/IPv6 network with no host bits set (IPv4) and a legal prefix length. */
export function validateCidr(raw: string): string | null {
  const text = raw.trim();
  const msg = `'${text}' is not a valid CIDR block (for example 192.0.2.0/24 or 2001:db8::/32).`;
  const parts = text.split("/");
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) return msg;
  const prefix = Number(parts[1]);
  if (!validateIPv4(parts[0])) {
    if (prefix > 32) return msg;
    const n = parts[0].split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
    const hostBits = 32 - prefix;
    return hostBits > 0 && n % 2 ** hostBits !== 0 ? `'${text}' has host bits set; use the network address (for example 192.0.2.0/24).` : null;
  }
  if (!validateIPv6(parts[0]) && prefix <= 128) return null;
  return msg;
}
