/**
 * A small, read-only command interpreter behind the simulated CloudShell. It understands the AWS CLI
 * calls that matter for Route 53 plus `dig`, and answers from the console's own API, formatting the
 * output the way the AWS CLI does.
 */
import { ApiError, api } from "@/lib/api";
import type { DnsRecord, HealthCheck, HostedZone, Page, ResolveResponse, User } from "@/types/api";

export interface ShellOutput {
  text: string;
  error?: boolean;
  clear?: boolean;
}

const json = (value: unknown) => JSON.stringify(value, null, 4);
const fqdn = (name: string) => (name.endsWith(".") ? name : `${name}.`);
const zoneIdArg = (raw: string) => raw.replace(/^\/?hostedzone\//, "");

/** Splits a command line into words, honouring single and double quotes. */
export function tokenize(line: string): string[] {
  const words: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) words.push(m[1] ?? m[2] ?? m[3]);
  return words;
}

function options(words: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith("--")) {
      const [key, inline] = words[i].slice(2).split("=", 2);
      if (inline !== undefined) out[key] = inline;
      else if (words[i + 1] && !words[i + 1].startsWith("--")) out[key] = words[++i];
      else out[key] = "true";
    }
  }
  return out;
}

const HELP = `Simulated AWS CloudShell (read-only). Commands answer from this console's data.

  aws sts get-caller-identity
  aws route53 list-hosted-zones
  aws route53 get-hosted-zone --id <zone-id>
  aws route53 list-resource-record-sets --hosted-zone-id <zone-id>
  aws route53 list-health-checks
  aws route53 test-dns-answer --hosted-zone-id <zone-id> --record-name <name> --record-type <type>
  aws route53domains list-domains
  dig <name> [type]            nslookup <name>
  clear  help  whoami  pwd  date  echo  aws --version

Changes (create, change, delete) are made in the console; this shell cannot modify resources.`;

const MUTATING = /^(create|change|delete|update|associate|disassociate|register|transfer|enable|disable|put|tag)-/;

function zoneOut(z: HostedZone) {
  return {
    Id: `/hostedzone/${z.zone_id}`,
    Name: fqdn(z.name),
    CallerReference: `console-${z.id}`,
    Config: { Comment: z.comment || undefined, PrivateZone: z.type === "private" },
    ResourceRecordSetCount: z.record_count,
  };
}

function recordOut(r: DnsRecord) {
  const out: Record<string, unknown> = { Name: fqdn(r.name), Type: r.type };
  if (r.set_identifier) out.SetIdentifier = r.set_identifier;
  if (r.weight !== null) out.Weight = r.weight;
  if (r.region) out.Region = r.region;
  if (r.failover) out.Failover = r.failover;
  if (r.geo_continent || r.geo_country) out.GeoLocation = { ContinentCode: r.geo_continent ?? undefined, CountryCode: r.geo_country ?? undefined, SubdivisionCode: r.geo_subdivision ?? undefined };
  if (r.routing_policy === "multivalue") out.MultiValueAnswer = true;
  if (r.cidr_collection_id) out.CidrRoutingConfig = { CollectionId: r.cidr_collection_id, LocationName: r.cidr_location };
  if (r.alias) {
    out.AliasTarget = { HostedZoneId: r.alias.hosted_zone_id ?? undefined, DNSName: fqdn(r.alias.target), EvaluateTargetHealth: r.alias.evaluate_target_health };
  } else {
    out.TTL = r.ttl;
    out.ResourceRecords = r.values.map((Value) => ({ Value }));
  }
  if (r.health_check_id) out.HealthCheckId = r.health_check_id;
  if (r.policy_record_id) out.TrafficPolicyInstanceId = r.policy_record_id;
  return out;
}

async function allPages<T>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const first = await api.get<Page<T>>(path, { ...params, page_size: 100 });
  const items = [...first.items];
  for (let page = 2; page <= Math.min(first.pages, 10); page++) items.push(...(await api.get<Page<T>>(path, { ...params, page_size: 100, page })).items);
  return items;
}

function digOutput(name: string, type: string, r: ResolveResponse): string {
  const lines = [
    `; <<>> DiG 9.18 (simulated by Route 53 console) <<>> ${name} ${type}`,
    ";; global options: +cmd",
    ";; Got answer:",
    `;; ->>HEADER<<- opcode: QUERY, status: ${r.rcode}, id: ${Math.floor(Math.random() * 60000) + 1000}`,
    `;; flags: qr rd ra; QUERY: 1, ANSWER: ${r.answers.length}, AUTHORITY: 0, ADDITIONAL: 0`,
    "",
    ";; QUESTION SECTION:",
    `;${fqdn(name)}\t\tIN\t${type}`,
  ];
  if (r.answers.length) {
    lines.push("", ";; ANSWER SECTION:", ...r.answers.map((a) => `${fqdn(a.name)}\t${a.ttl}\tIN\t${a.type}\t${a.value}`));
  }
  if (r.blocked_by) lines.push("", `;; Blocked by DNS Firewall: ${r.blocked_by}`);
  if (r.forwarded_to.length) lines.push("", `;; Forwarded to ${r.forwarded_to.join(", ")} by a Resolver rule`);
  lines.push("", ";; SERVER: 10.0.0.2#53(10.0.0.2) (UDP)", `;; WHEN: ${new Date().toUTCString()}`);
  return lines.join("\n");
}

export async function runCommand(line: string, user: User): Promise<ShellOutput> {
  const words = tokenize(line.trim());
  if (words.length === 0) return { text: "" };
  const [cmd, ...rest] = words;
  try {
    switch (cmd) {
      case "help":
        return { text: HELP };
      case "clear":
        return { text: "", clear: true };
      case "whoami":
        return { text: "cloudshell-user" };
      case "pwd":
        return { text: "/home/cloudshell-user" };
      case "ls":
        return { text: "" };
      case "date":
        return { text: new Date().toUTCString() };
      case "echo":
        return { text: rest.join(" ") };
      case "dig":
      case "nslookup": {
        const args = rest.filter((w) => !w.startsWith("@") && !w.startsWith("+"));
        const name = args[0];
        if (!name) return { text: `usage: ${cmd} <name> [type]`, error: true };
        const type = (cmd === "dig" ? args[1] : undefined)?.toUpperCase() ?? "A";
        const r = await api.get<ResolveResponse>("/dns/resolve", { name, type });
        if (cmd === "dig") return { text: digOutput(name, type, r) };
        return {
          text: [`Server:\t\t10.0.0.2`, `Address:\t10.0.0.2#53`, "", r.answers.length ? `Non-authoritative answer:\n${r.answers.map((a) => `Name:\t${a.name}\nAddress: ${a.value}`).join("\n")}` : `** server can't find ${name}: ${r.rcode}`].join("\n"),
        };
      }
      case "aws":
        return await runAws(rest, user);
      default:
        return { text: `bash: ${cmd}: command not found. Type "help" for the commands this shell supports.`, error: true };
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.detail : error instanceof Error ? error.message : "Unknown error";
    return { text: `An error occurred: ${message}`, error: true };
  }
}

async function runAws(words: string[], user: User): Promise<ShellOutput> {
  const [service, op, ...rest] = words;
  if (!service || service === "help") return { text: HELP };
  if (service === "--version") return { text: "aws-cli/2.17.0 Python/3.11 Linux/cloudshell exe/x86_64 (simulated)" };
  const opts = options(rest);
  if (op && MUTATING.test(op)) {
    return { text: `An error occurred (AccessDenied) when calling the ${op} operation: this simulated CloudShell is read-only. Make the change in the console instead.`, error: true };
  }
  if (service === "sts" && op === "get-caller-identity") {
    return { text: json({ UserId: `AIDA${user.account_id}EXAMPLE`, Account: user.account_id, Arn: `arn:aws:iam::${user.account_id}:user/${user.email.split("@")[0]}` }) };
  }
  if (service === "route53") {
    if (op === "list-hosted-zones") {
      const zones = await allPages<HostedZone>("/hosted-zones");
      return { text: json({ HostedZones: zones.map(zoneOut) }) };
    }
    if (op === "get-hosted-zone") {
      if (!opts.id) return { text: "aws: error: the following arguments are required: --id", error: true };
      const z = await api.get<HostedZone>(`/hosted-zones/${zoneIdArg(opts.id)}`);
      const out: Record<string, unknown> = { HostedZone: zoneOut(z), DelegationSet: { NameServers: z.name_servers } };
      if (z.vpcs.length) out.VPCs = z.vpcs.map((v) => ({ VPCRegion: v.region, VPCId: v.vpc_id }));
      return { text: json(out) };
    }
    if (op === "list-resource-record-sets") {
      if (!opts["hosted-zone-id"]) return { text: "aws: error: the following arguments are required: --hosted-zone-id", error: true };
      const records = await allPages<DnsRecord>(`/hosted-zones/${zoneIdArg(opts["hosted-zone-id"])}/records`);
      return { text: json({ ResourceRecordSets: records.map(recordOut) }) };
    }
    if (op === "list-health-checks") {
      const checks = await allPages<HealthCheck>("/health-checks");
      return {
        text: json({
          HealthChecks: checks.map((h) => ({ Id: h.health_check_id, CallerReference: `console-${h.id}`, HealthCheckConfig: { Type: h.type, FullyQualifiedDomainName: h.endpoint, Port: h.port }, HealthCheckVersion: 1, Status: h.status })),
        }),
      };
    }
    if (op === "test-dns-answer") {
      const name = opts["record-name"];
      const type = (opts["record-type"] ?? "A").toUpperCase();
      if (!name) return { text: "aws: error: the following arguments are required: --record-name", error: true };
      const r = await api.get<ResolveResponse>("/dns/resolve", { name, type });
      return { text: json({ Nameserver: "ns-1.awsdns-01.com", RecordName: fqdn(name), RecordType: type, RecordData: r.answers.map((a) => a.value), ResponseCode: r.rcode, Protocol: "UDP" }) };
    }
  }
  if (service === "route53domains" && op === "list-domains") {
    const domains = await allPages<Record<string, unknown>>("/resources/domain");
    return { text: json({ Domains: domains.map((d) => ({ DomainName: d.name, AutoRenew: d.auto_renew, TransferLock: d.transfer_lock, Expiry: d.expires_at })) }) };
  }
  return { text: `aws: error: argument operation: "${[service, op].filter(Boolean).join(" ")}" is not supported by this simulated shell. Type "help" for the supported commands.`, error: true };
}
