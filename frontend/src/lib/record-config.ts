import type { AliasTargetType, DnsRecord, RecordInput, RecordType, RoutingPolicy } from "@/types/api";

export type ValueMode = "lines" | "single" | "mx" | "srv" | "caa";

export interface RecordTypeConfig {
  type: RecordType;
  label: string;
  description: string;
  mode: ValueMode;
  placeholder?: string;
  help: string;
  supportsAlias: boolean;
}

export const RECORD_TYPES: RecordTypeConfig[] = [
  { type: "A", label: "A", description: "Routes traffic to an IPv4 address and some AWS resources", mode: "lines", placeholder: "192.0.2.44\n192.0.2.45", help: "Enter one IPv4 address per line.", supportsAlias: true },
  { type: "AAAA", label: "AAAA", description: "Routes traffic to an IPv6 address and some AWS resources", mode: "lines", placeholder: "2001:db8::1", help: "Enter one IPv6 address per line.", supportsAlias: true },
  { type: "CAA", label: "CAA", description: "Restricts CAs that can create SSL/TLS certificates for the domain", mode: "caa", help: "Each row is one CAA value, e.g. 0 issue \"letsencrypt.org\".", supportsAlias: false },
  { type: "CNAME", label: "CNAME", description: "Routes traffic to another domain name and to some AWS resources", mode: "single", placeholder: "www.example.com", help: "Enter the domain name this name should point to.", supportsAlias: true },
  { type: "MX", label: "MX", description: "Routes traffic to mail servers", mode: "mx", help: "Each row is a priority and a mail server host name. Lower priority is preferred.", supportsAlias: false },
  { type: "NS", label: "NS", description: "Identifies the name servers for the hosted zone", mode: "lines", placeholder: "ns-1.example.net\nns-2.example.net", help: "Enter one name server host name per line.", supportsAlias: false },
  { type: "PTR", label: "PTR", description: "Maps an IP address to a domain name", mode: "lines", placeholder: "host.example.com", help: "Enter one domain name per line.", supportsAlias: false },
  { type: "SRV", label: "SRV", description: "Specifies the location of services such as SIP or LDAP", mode: "srv", help: "Name format: _service._protocol (for example _sip._tcp). Each row is one SRV value.", supportsAlias: false },
  { type: "TXT", label: "TXT", description: "Used to verify email senders and for application-specific values", mode: "lines", placeholder: '"v=spf1 include:_spf.example.com ~all"', help: "One value per line. Wrap in double quotes to supply several strings (\"part one\" \"part two\"); unquoted text is quoted automatically.", supportsAlias: false },
];

// SOA is managed by Route 53: it is editable (TTL/values) but never offered when creating a record.
const SOA_CONFIG: RecordTypeConfig = {
  type: "SOA",
  label: "SOA",
  description: "Start of authority: identifies the primary name server and zone parameters",
  mode: "single",
  help: "Format: primary-ns hostmaster serial refresh retry expire minimum.",
  supportsAlias: false,
};

export const RECORD_TYPE_MAP = Object.fromEntries([...RECORD_TYPES, SOA_CONFIG].map((t) => [t.type, t])) as Record<string, RecordTypeConfig>;

export const ROUTING_POLICIES: { value: RoutingPolicy; label: string; description: string }[] = [
  { value: "simple", label: "Simple routing", description: "Route traffic to a single resource" },
  { value: "weighted", label: "Weighted", description: "Route a percentage of traffic to each resource" },
  { value: "latency", label: "Latency", description: "Route to the AWS Region with the lowest latency" },
  { value: "failover", label: "Failover", description: "Route to a standby resource when the primary is unhealthy" },
  { value: "geolocation", label: "Geolocation", description: "Route based on the location of your users" },
  { value: "multivalue", label: "Multivalue answer", description: "Return up to eight healthy values at random" },
  { value: "ipbased", label: "IP-based", description: "Route based on the client IP address using a CIDR collection" },
];
export const ROUTING_LABEL = Object.fromEntries(ROUTING_POLICIES.map((p) => [p.value, p.label])) as Record<RoutingPolicy, string>;

export const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "sa-east-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "eu-central-1", "eu-north-1", "eu-south-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
  "ap-northeast-2", "ap-northeast-3", "me-south-1", "af-south-1",
];

export const CONTINENTS: Record<string, string> = {
  AF: "Africa", AN: "Antarctica", AS: "Asia", EU: "Europe", NA: "North America", OC: "Oceania", SA: "South America",
};

export const COUNTRIES: Record<string, string> = {
  AU: "Australia", BR: "Brazil", CA: "Canada", CN: "China", DE: "Germany", EG: "Egypt", ES: "Spain", FR: "France",
  GB: "United Kingdom", IN: "India", IT: "Italy", JP: "Japan", KR: "South Korea", MX: "Mexico", NL: "Netherlands",
  NG: "Nigeria", PK: "Pakistan", RU: "Russia", SE: "Sweden", SG: "Singapore", US: "United States", ZA: "South Africa",
};

export const ALIAS_TARGET_TYPES: { value: AliasTargetType; label: string; placeholder: string }[] = [
  { value: "cloudfront", label: "CloudFront distribution", placeholder: "d111111abcdef8.cloudfront.net" },
  { value: "elb", label: "Application/Classic Load Balancer", placeholder: "my-alb-1234.us-east-1.elb.amazonaws.com" },
  { value: "s3-website", label: "S3 website endpoint", placeholder: "s3-website-us-east-1.amazonaws.com" },
  { value: "api-gateway", label: "API Gateway API", placeholder: "abc123.execute-api.us-east-1.amazonaws.com" },
  { value: "record", label: "Another record in this hosted zone", placeholder: "www" },
];

export const TTL_PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];

export const DEFAULT_TTL = 300;

// ------------------------------------------------------------------ form model
export interface RecordFormValues {
  name: string;
  type: RecordType;
  aliasEnabled: boolean;
  aliasTarget: string;
  aliasTargetType: AliasTargetType;
  evaluateTargetHealth: boolean;
  valuesText: string;
  mxRows: { priority: string; server: string }[];
  srvRows: { priority: string; weight: string; port: string; target: string }[];
  caaRows: { flags: string; tag: string; value: string }[];
  ttl: string;
  routingPolicy: RoutingPolicy;
  setIdentifier: string;
  weight: string;
  region: string;
  failover: "PRIMARY" | "SECONDARY";
  geoKind: "default" | "continent" | "country";
  geoContinent: string;
  geoCountry: string;
  geoSubdivision: string;
  cidrCollectionId: string;
  cidrLocation: string;
  healthCheckId: string;
}

export const emptyFormValues = (type: RecordType = "A"): RecordFormValues => ({
  name: "",
  type,
  aliasEnabled: false,
  aliasTarget: "",
  aliasTargetType: "cloudfront",
  evaluateTargetHealth: false,
  valuesText: "",
  mxRows: [{ priority: "10", server: "" }],
  srvRows: [{ priority: "10", weight: "5", port: "", target: "" }],
  caaRows: [{ flags: "0", tag: "issue", value: "" }],
  ttl: String(DEFAULT_TTL),
  routingPolicy: "simple",
  setIdentifier: "",
  weight: "100",
  region: "us-east-1",
  failover: "PRIMARY",
  geoKind: "default",
  geoContinent: "EU",
  geoCountry: "US",
  geoSubdivision: "",
  cidrCollectionId: "",
  cidrLocation: "*",
  healthCheckId: "",
});

/** Collects the type-specific value inputs into the API's list of presentation strings. */
export function collectValues(v: RecordFormValues): string[] {
  const mode = RECORD_TYPE_MAP[v.type]?.mode;
  switch (mode) {
    case "mx":
      return v.mxRows.map((r) => `${r.priority.trim()} ${r.server.trim()}`.trim());
    case "srv":
      return v.srvRows.map((r) => `${r.priority.trim()} ${r.weight.trim()} ${r.port.trim()} ${r.target.trim()}`.trim());
    case "caa":
      return v.caaRows.map((r) => `${r.flags.trim()} ${r.tag.trim()} "${r.value.trim().replace(/^"(.*)"$/, "$1")}"`);
    default:
      return v.valuesText.split("\n").map((l) => l.trim()).filter(Boolean);
  }
}

export function formToInput(v: RecordFormValues): RecordInput {
  const policy = v.routingPolicy;
  return {
    name: v.name.trim(),
    type: v.type,
    ttl: v.aliasEnabled ? null : Number(v.ttl),
    values: v.aliasEnabled ? [] : collectValues(v),
    routing_policy: policy,
    set_identifier: policy === "simple" ? null : v.setIdentifier.trim(),
    weight: policy === "weighted" ? Number(v.weight) : null,
    region: policy === "latency" ? v.region : null,
    failover: policy === "failover" ? v.failover : null,
    geo_continent: policy === "geolocation" && v.geoKind === "continent" ? v.geoContinent : null,
    geo_country: policy === "geolocation" ? (v.geoKind === "default" ? "*" : v.geoKind === "country" ? v.geoCountry : null) : null,
    geo_subdivision: policy === "geolocation" && v.geoKind === "country" && v.geoCountry === "US" ? v.geoSubdivision.trim() || null : null,
    cidr_collection_id: policy === "ipbased" ? v.cidrCollectionId || null : null,
    cidr_location: policy === "ipbased" ? v.cidrLocation || null : null,
    alias: v.aliasEnabled ? { target: v.aliasTarget.trim(), target_type: v.aliasTargetType, evaluate_target_health: v.evaluateTargetHealth } : null,
    health_check_id: v.healthCheckId || null,
  };
}

export function relativeName(fqdn: string, zoneName: string): string {
  const apex = `${zoneName}.`;
  if (fqdn === apex) return "";
  return fqdn.endsWith(`.${apex}`) ? fqdn.slice(0, -(apex.length + 1)) : fqdn;
}

export function recordToForm(r: DnsRecord, zoneName: string): RecordFormValues {
  const base = emptyFormValues(r.type);
  const str = (x: unknown) => String(x ?? "");
  const parsed = r.parsed_values;
  const geoKind = r.geo_continent ? "continent" : r.geo_country && r.geo_country !== "*" ? "country" : "default";
  return {
    ...base,
    name: relativeName(r.name, zoneName),
    aliasEnabled: !!r.alias,
    aliasTarget: r.alias ? (r.alias.target_type === "record" ? relativeName(r.alias.target, zoneName) : r.alias.target.replace(/\.$/, "")) : "",
    aliasTargetType: r.alias?.target_type ?? "cloudfront",
    evaluateTargetHealth: r.alias?.evaluate_target_health ?? false,
    valuesText: r.values.join("\n"),
    mxRows: r.type === "MX" && parsed.length ? parsed.map((p) => ({ priority: str(p.priority), server: str(p.exchange) })) : base.mxRows,
    srvRows: r.type === "SRV" && parsed.length ? parsed.map((p) => ({ priority: str(p.priority), weight: str(p.weight), port: str(p.port), target: str(p.target) })) : base.srvRows,
    caaRows: r.type === "CAA" && parsed.length ? parsed.map((p) => ({ flags: str(p.flags), tag: str(p.tag), value: str(p.value) })) : base.caaRows,
    ttl: String(r.ttl ?? DEFAULT_TTL),
    routingPolicy: r.routing_policy,
    setIdentifier: r.set_identifier,
    weight: str(r.weight ?? 100),
    region: r.region ?? "us-east-1",
    failover: r.failover ?? "PRIMARY",
    geoKind,
    geoContinent: r.geo_continent ?? "EU",
    geoCountry: r.geo_country && r.geo_country !== "*" ? r.geo_country : "US",
    geoSubdivision: r.geo_subdivision ?? "",
    cidrCollectionId: r.cidr_collection_id ?? "",
    cidrLocation: r.cidr_location ?? "*",
    healthCheckId: r.health_check_id ?? "",
  };
}

/** Human-readable "Value / Route traffic to" cell. */
export function displayValues(r: DnsRecord): string[] {
  if (r.alias) return [`Alias to ${r.alias.target}`];
  return r.values;
}

export function displayGeo(r: DnsRecord): string {
  if (r.geo_continent) return CONTINENTS[r.geo_continent] ?? r.geo_continent;
  if (r.geo_country === "*") return "Default";
  if (r.geo_country) return r.geo_subdivision ? `${COUNTRIES[r.geo_country] ?? r.geo_country}: ${r.geo_subdivision}` : (COUNTRIES[r.geo_country] ?? r.geo_country);
  return "";
}

/** The Route 53 "Differentiator" column: the policy-specific setting plus record ID. */
export function differentiator(r: DnsRecord): string {
  switch (r.routing_policy) {
    case "weighted": return `Weight: ${r.weight}`;
    case "latency": return `Region: ${r.region}`;
    case "failover": return r.failover === "PRIMARY" ? "Failover: Primary" : "Failover: Secondary";
    case "geolocation": return `Location: ${displayGeo(r)}`;
    case "ipbased": return `CIDR location: ${r.cidr_location === "*" ? "Default" : r.cidr_location}`;
    case "multivalue": return "Multivalue answer";
    default: return "-";
  }
}
