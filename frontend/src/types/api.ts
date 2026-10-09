export type RecordType = "A" | "AAAA" | "CAA" | "CNAME" | "MX" | "NS" | "PTR" | "SRV" | "TXT" | "SOA";
export type RoutingPolicy = "simple" | "weighted" | "latency" | "failover" | "geolocation" | "multivalue";
export type ZoneType = "public" | "private";
export type AliasTargetType = "cloudfront" | "elb" | "s3-website" | "api-gateway" | "record";

export interface User {
  id: number;
  email: string;
  display_name: string;
  account_id: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Vpc {
  vpc_id: string;
  region: string;
}

export interface HostedZone {
  id: number;
  zone_id: string;
  name: string;
  type: ZoneType;
  comment: string;
  record_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  name_servers: string[];
  vpcs: Vpc[];
}

export interface HostedZoneInput {
  name: string;
  comment: string;
  type: ZoneType;
  vpc?: Vpc | null;
}

export interface Alias {
  target: string;
  target_type: AliasTargetType;
  evaluate_target_health: boolean;
  hosted_zone_id?: string | null;
}

export interface DnsRecord {
  id: number;
  zone_id: string;
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  parsed_values: Record<string, string | number | string[]>[];
  routing_policy: RoutingPolicy;
  set_identifier: string;
  weight: number | null;
  region: string | null;
  failover: "PRIMARY" | "SECONDARY" | null;
  geo_continent: string | null;
  geo_country: string | null;
  geo_subdivision: string | null;
  alias: Alias | null;
  health_check_id: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordInput {
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier: string | null;
  weight: number | null;
  region: string | null;
  failover: string | null;
  geo_continent: string | null;
  geo_country: string | null;
  geo_subdivision: string | null;
  alias: { target: string; target_type: AliasTargetType; evaluate_target_health: boolean } | null;
  health_check_id: string | null;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: { id: number; reason: string }[];
}

export interface BulkTtlResult {
  updated: number;
  skipped: { id: number; reason: string }[];
}

export interface ImportItem {
  line: number;
  name: string;
  type: string;
  ttl: number;
  values: string[];
  status: "ok" | "error" | "skipped";
  message: string | null;
}

export interface ImportResult {
  dry_run: boolean;
  committed: boolean;
  created: number;
  valid: number;
  errors: number;
  skipped: number;
  items: ImportItem[];
}

export interface HealthCheck {
  id: number;
  health_check_id: string;
  name: string;
  type: string;
  endpoint: string;
  port: number;
  status: "HEALTHY" | "UNHEALTHY";
}

export interface ResolveAnswer {
  name: string;
  type: string;
  ttl: number;
  value: string;
}

export interface ResolveResponse {
  name: string;
  type: string;
  rcode: string;
  answers: ResolveAnswer[];
  hosted_zone_id: string | null;
  record_id: number | null;
  routing_policy: string | null;
  trace: string[];
}

export interface DashboardSummary {
  hosted_zones: number;
  public_zones: number;
  private_zones: number;
  records: number;
  health_checks: number;
  unhealthy_health_checks: number;
  recent_zones: { zone_id: string; name: string; type: ZoneType; record_count: number }[];
}

export interface MockVpc {
  vpc_id: string;
  name: string;
  region: string;
  cidr: string;
}
