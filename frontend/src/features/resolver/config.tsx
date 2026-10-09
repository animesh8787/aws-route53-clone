"use client";

import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";

import { BriefTable, type Brief } from "@/components/common/BriefTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RowsEditor } from "@/components/resource/RowsEditor";
import { validateHostname, validateInt, validateIPv4 } from "@/lib/dns-validation";
import type { CustomFieldProps, FormValues, ResourceConfig, ResourceItem } from "@/lib/resource-config";

const NAME_RULE = (v: unknown) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.");
const list = (i: ResourceItem, key: string) => (i[key] as Record<string, unknown>[] | undefined) ?? [];
const strs = (i: ResourceItem, key: string) => (i[key] as string[] | undefined) ?? [];
const briefs = (i: ResourceItem, key: string): Brief[] => (i[key] as Brief[] | undefined) ?? [];

// ------------------------------------------------------------------ VPC overview (read-only)
export const resolverVpcConfig: ResourceConfig = {
  route: "resolver",
  api: "/resolver/vpcs",
  title: "VPCs",
  singular: "VPC",
  description: "VPCs and the Resolver resources attached to each: endpoints, rules, query logging, DNS Firewall and profiles.",
  help: {
    summary: "This page summarises what applies to each VPC. It is read-only: change associations from the rule, firewall, query logging or profile pages.",
    points: ["Endpoints let your VPC resolve names on your network (outbound) and let your network resolve names in the VPC (inbound).", "Forwarding rules send matching queries to your own DNS servers.", "Use Test record in a hosted zone with a source VPC to see these settings applied."],
  },
  readOnly: true,
  searchPlaceholder: "Filter VPCs by ID, name, Region or CIDR",
  columns: [
    { id: "id", header: "ID", cell: (i) => String(i.id) },
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "rules", header: "Rules", sortKey: "rule_count", cell: (i) => String(i.rule_count) },
    { id: "outbound", header: "Outbound endpoints", cell: (i) => String(briefs(i, "outbound_endpoints").length) },
    { id: "inbound", header: "Inbound endpoints", cell: (i) => String(briefs(i, "inbound_endpoints").length) },
    { id: "logstatus", header: "Query logging status", cell: (i) => (Number(i.logging_count) > 0 ? "Logging" : "Not logging") },
    { id: "logging", header: "Query logging configs", cell: (i) => String(i.logging_count) },
    { id: "firewall", header: "DNS Firewall rule groups", cell: (i) => String(i.firewall_count) },
    { id: "failopen", header: "DNS Firewall fail open", cell: () => "Disabled" },
    { id: "dnssec", header: "DNSSEC validation", cell: () => "Disabled" },
    { id: "reverse", header: "Autodefined Reverse", cell: () => "Enabled" },
    { id: "region", header: "Region", sortKey: "region", hidden: true, cell: (i) => String(i.region) },
    { id: "cidr", header: "CIDR", sortKey: "cidr", hidden: true, cell: (i) => String(i.cidr) },
    { id: "profile", header: "Profile", hidden: true, cell: (i) => (i.profile ? (i.profile as Brief).name : "-") },
  ],
  fields: [],
  detailRows: [
    { label: "VPC ID", value: (i) => String(i.id) },
    { label: "Region", value: (i) => String(i.region) },
    { label: "CIDR", value: (i) => String(i.cidr) },
    { label: "Profile", value: (i) => (i.profile ? (i.profile as Brief).name : "None") },
  ],
  detailTabs: [
    {
      id: "endpoints",
      label: (i) => `Endpoints (${i.endpoint_count})`,
      render: (i) => (
        <SpaceBetween size="m">
          <Box variant="h4">Inbound</Box>
          <BriefTable items={briefs(i, "inbound_endpoints")} hrefBase="/resolver-inbound" noun="inbound endpoints" />
          <Box variant="h4">Outbound</Box>
          <BriefTable items={briefs(i, "outbound_endpoints")} hrefBase="/resolver-outbound" noun="outbound endpoints" />
        </SpaceBetween>
      ),
    },
    { id: "rules", label: (i) => `Rules (${i.rule_count})`, render: (i) => <BriefTable items={briefs(i, "rules")} hrefBase="/resolver-rules" noun="rules" /> },
    { id: "firewall", label: (i) => `DNS Firewall (${i.firewall_count})`, render: (i) => <BriefTable items={(briefs(i, "firewall_groups") as (Brief & { priority?: number })[]).map((g) => ({ ...g, extra: `Association priority ${g.priority}` }))} hrefBase="/dns-firewall" noun="rule groups" /> },
    { id: "logging", label: (i) => `Query logging (${i.logging_count})`, render: (i) => <BriefTable items={briefs(i, "query_logging")} hrefBase="/resolver-query-logging" noun="query logging configurations" /> },
    { id: "zones", label: (i) => `Private zones (${list(i, "private_zones").length})`, render: (i) => <BriefTable items={list(i, "private_zones") as unknown as Brief[]} hrefBase="/hosted-zones" noun="private hosted zones" /> },
  ],
};

// ------------------------------------------------------------------ endpoints
function IpAddressesField({ value, onChange, error }: CustomFieldProps) {
  return (
    <RowsEditor
      label="IP addresses"
      description="2 to 6 addresses, each in a subnet. Leave the address empty to have one assigned from the VPC range."
      error={error}
      rows={(Array.isArray(value) ? value : []) as Record<string, unknown>[]}
      columns={[
        { key: "subnet_id", label: "Subnet ID", type: "text", width: "2fr", placeholder: "subnet-0a1b2c3d" },
        { key: "ip", label: "IP address (optional)", type: "text", width: "2fr", placeholder: "auto-assign" },
      ]}
      blank={{ subnet_id: "", ip: "" }}
      addLabel="Add IP address"
      rowNoun="IP address"
      onChange={onChange}
    />
  );
}

const PROTOCOLS = ["Do53", "DoH", "DoT"].map((p) => ({ value: p, label: p, description: p === "Do53" ? "Plain DNS over UDP/TCP port 53" : p === "DoH" ? "DNS over HTTPS" : "DNS over TLS" }));

function endpointConfig(direction: "inbound" | "outbound"): ResourceConfig {
  const inbound = direction === "inbound";
  return {
    route: inbound ? "resolver-inbound" : "resolver-outbound",
    api: `/resources/resolver_${direction}`,
    title: inbound ? "Inbound endpoints" : "Outbound endpoints",
    singular: `${direction} endpoint`,
    description: inbound ? "Let DNS queries from your network resolve names inside your VPC." : "Let resources in your VPC send DNS queries to your own DNS servers.",
    help: {
      summary: inbound ? "An inbound endpoint gives your network IP addresses to send DNS queries to." : "An outbound endpoint sends queries from your VPC to the DNS servers you name in a forwarding rule.",
      points: ["Provide at least two IP addresses in different subnets for availability.", "Addresses must be inside the VPC CIDR; the first four addresses of a range are reserved.", inbound ? "Point your network's DNS servers at the endpoint IP addresses." : "An outbound endpoint cannot be deleted while a forwarding rule uses it."],
    },
    searchPlaceholder: "Filter endpoints by name, ID or VPC",
    columns: [
      { id: "id", header: "ID", cell: (i) => String(i.id) },
      { id: "name", header: "Name", sortKey: "name", link: true, cell: (i) => i.name },
      { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
      { id: "vpc", header: "Host VPC", sortKey: "vpc_id", cell: (i) => String(i.vpc_id) },
      { id: "ips", header: "IP addresses", cell: (i) => list(i, "ip_addresses").map((a) => String(a.ip)).join(", ") },
      ...(inbound ? [] : [{ id: "rules", header: "Rules", cell: (i: ResourceItem) => String(i.rule_count ?? 0) }]),
      { id: "etype", header: "Resolver Endpoint Type", cell: () => "IPv4" },
      ...(inbound ? [{ id: "category", header: "Endpoint Category", cell: () => "Default" }] : []),
      { id: "protocols", header: "Transmission protocols", cell: (i) => strs(i, "protocols").join(", ") },
    ],
    fields: [
      { type: "text", name: "name", label: "Endpoint name", placeholder: inbound ? "corp-inbound" : "corp-outbound", validate: NAME_RULE },
      { type: "select", name: "vpc_id", label: "VPC", source: "vpcs", disabledOnEdit: true, description: "The VPC cannot be changed after creation." },
      { type: "lines", name: "security_group_ids", label: "Security group IDs", placeholder: "sg-0a1b2c3d4e", description: "One per line. The groups must allow DNS traffic.", validate: (v) => ((v as string[]).map((x) => x.trim()).filter(Boolean).every((x) => /^sg-[0-9a-f]{8,17}$/.test(x)) ? null : "Use IDs like sg-0a1b2c3d4e (sg- followed by 8-17 hex characters).") },
      { type: "multiselect", name: "protocols", label: "Protocols", options: PROTOCOLS },
      {
        type: "custom", name: "ip_addresses", label: "IP addresses", render: (p) => <IpAddressesField {...p} />,
        validate: (v) => {
          const rows = (Array.isArray(v) ? v : []) as { subnet_id: string; ip: string }[];
          if (rows.length < 2 || rows.length > 6) return "An endpoint needs between 2 and 6 IP addresses.";
          for (const [i, r] of rows.entries()) {
            if (!/^subnet-[0-9a-f]{8,17}$/.test(String(r.subnet_id).trim())) return `Address ${i + 1}: use a subnet ID like subnet-0a1b2c3d.`;
            if (String(r.ip).trim() && validateIPv4(String(r.ip))) return `Address ${i + 1}: '${r.ip}' is not a valid IPv4 address.`;
          }
          return null;
        },
      },
    ],
    defaults: { protocols: ["Do53"], ip_addresses: [{ subnet_id: "", ip: "" }, { subnet_id: "", ip: "" }] },
    detailRows: [
      { label: "Endpoint ID", value: (i) => String(i.id) },
      { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
      { label: "Direction", value: (i) => String(i.direction) },
      { label: "VPC", value: (i) => String(i.vpc_id) },
      { label: "Protocols", value: (i) => strs(i, "protocols").join(", ") },
      { label: "Security groups", value: (i) => strs(i, "security_group_ids").join(", ") },
    ],
    detailTabs: [
      {
        id: "ips",
        label: (i) => `IP addresses (${list(i, "ip_addresses").length})`,
        render: (i) => (
          <Table
            variant="embedded"
            items={list(i, "ip_addresses")}
            trackBy="ip"
            columnDefinitions={[{ id: "ip", header: "IP address", cell: (r) => String(r.ip) }, { id: "subnet", header: "Subnet ID", cell: (r) => String(r.subnet_id) }]}
          />
        ),
      },
    ],
    deleteWarning: () => (inbound ? null : "Deletion is blocked while a forwarding rule uses this endpoint."),
  };
}

export const inboundEndpointConfig = endpointConfig("inbound");
export const outboundEndpointConfig = endpointConfig("outbound");

// ------------------------------------------------------------------ rules
function TargetIpsField({ value, onChange, error }: CustomFieldProps) {
  return (
    <RowsEditor
      label="Target IP addresses"
      description="The DNS servers that receive the forwarded queries (1 to 6)."
      error={error}
      rows={(Array.isArray(value) ? value : []) as Record<string, unknown>[]}
      columns={[
        { key: "ip", label: "IP address", type: "text", width: "3fr", placeholder: "10.0.1.53" },
        { key: "port", label: "Port", type: "number", width: "1fr", placeholder: "53" },
      ]}
      blank={{ ip: "", port: 53 }}
      addLabel="Add target"
      rowNoun="target"
      onChange={onChange}
    />
  );
}

const isForward = (v: FormValues) => v.rule_type === "FORWARD";
const RULE_TYPES = [
  { value: "FORWARD", label: "Forward", description: "Send matching queries to your own DNS servers" },
  { value: "SYSTEM", label: "System", description: "Resolve matching queries with Route 53 instead of forwarding them" },
  { value: "RECURSIVE", label: "Recursive (internet resolver)", description: "The default rule that resolves everything else on the internet" },
];

export const resolverRuleConfig: ResourceConfig = {
  route: "resolver-rules",
  api: "/resources/resolver_rule",
  title: "Rules",
  singular: "resolver rule",
  description: "Decide where DNS queries for a domain are resolved: forwarded to your servers or resolved by Route 53.",
  help: {
    summary: "A forwarding rule matches a domain name and sends those queries through an outbound endpoint to your DNS servers.",
    points: ["The most specific (longest) matching domain wins.", "A VPC cannot have two rules for the same domain.", "Private hosted zones associated with the VPC are checked before rules.", "Forwarded queries are simulated in Test record: the answer comes from your servers, so none is shown."],
  },
  searchPlaceholder: "Filter rules by name, domain or ID",
  filters: [{ key: "rule_type", label: "rule types", options: RULE_TYPES.map((t) => ({ value: t.value, label: t.label })) }],
  columns: [
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "endpoint", header: "Outbound endpoint", cell: (i) => String(i.outbound_endpoint_id || "-") },
    { id: "type", header: "Type", sortKey: "rule_type", cell: (i) => String(i.rule_type) },
    { id: "sharing", header: "Sharing status", cell: () => "Not shared" },
    { id: "owner", header: "Owner", cell: (i) => String(i.owner_account_id ?? "-") },
    { id: "domain", header: "Domain name", sortKey: "domain_name", cell: (i) => String(i.domain_name) },
    { id: "delegation", header: "Delegation record", hidden: true, cell: () => "-" },
    { id: "targets", header: "Target IP addresses", cell: (i) => list(i, "target_ips").map((t) => `${t.ip}:${t.port}`).join(", ") || "-" },
    { id: "vpcs", header: "Associations", cell: (i) => String(strs(i, "vpc_ids").length) },
    { id: "protocols", header: "Transmission protocols", hidden: true, cell: () => "Do53" },
  ],
  fields: [
    { type: "text", name: "name", label: "Rule name", placeholder: "forward-corp", validate: NAME_RULE },
    { type: "select", name: "rule_type", label: "Rule type", options: RULE_TYPES },
    { type: "text", name: "domain_name", label: "Domain name", placeholder: "corp.example.com", visibleWhen: (v) => v.rule_type !== "RECURSIVE", validate: (v) => validateHostname(String(v), "Domain name") },
    { type: "select", name: "outbound_endpoint_id", label: "Outbound endpoint", source: "resources:resolver_outbound", visibleWhen: isForward, description: "The endpoint that sends the forwarded queries." },
    {
      type: "custom", name: "target_ips", label: "Target IP addresses", visibleWhen: isForward, render: (p) => <TargetIpsField {...p} />,
      validate: (v) => {
        const rows = (Array.isArray(v) ? v : []) as { ip: string; port: number | string }[];
        if (rows.length < 1 || rows.length > 6) return "Provide between 1 and 6 target IP addresses.";
        for (const [i, r] of rows.entries()) {
          const ip = String(r.ip).trim();
          if (!ip || (validateIPv4(ip) && !/^[0-9a-fA-F:]+$/.test(ip))) return `Target ${i + 1}: '${ip}' is not a valid IP address.`;
          const portError = validateInt(r.port, "Port", 1, 65535);
          if (portError) return `Target ${i + 1}: ${portError}`;
        }
        return null;
      },
    },
    { type: "multiselect", name: "vpc_ids", label: "VPC associations", optional: true, source: "vpcs", description: "A VPC can have only one rule per domain name." },
  ],
  defaults: { rule_type: "FORWARD", target_ips: [{ ip: "", port: 53 }] },
  detailRows: [
    { label: "Rule ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Type", value: (i) => String(i.rule_type) },
    { label: "Domain name", value: (i) => String(i.domain_name) },
    { label: "Outbound endpoint", value: (i) => (i.outbound_endpoint_id ? String(i.outbound_endpoint_id) : "-") },
  ],
  detailTabs: [
    { id: "targets", label: (i) => `Targets (${list(i, "target_ips").length})`, render: (i) => <Table variant="embedded" items={list(i, "target_ips")} trackBy="ip" columnDefinitions={[{ id: "ip", header: "IP address", cell: (r) => String(r.ip) }, { id: "port", header: "Port", cell: (r) => String(r.port) }]} empty={<Box textAlign="center">This rule type has no targets.</Box>} /> },
    { id: "vpcs", label: (i) => `VPC associations (${strs(i, "vpc_ids").length})`, render: (i) => <BriefTable items={strs(i, "vpc_ids").map((id) => ({ id, name: id }))} noun="VPCs" /> },
  ],
};

// ------------------------------------------------------------------ query logging
const ARN_RULES: Record<string, { re: RegExp; example: string }> = {
  "cloudwatch-logs": { re: /^arn:aws:logs:[a-z0-9-]+:\d{12}:log-group:[\w./#-]{1,512}(:\*)?$/, example: "arn:aws:logs:us-east-1:123456789012:log-group:/route53/resolver-queries" },
  s3: { re: /^arn:aws:s3:::[a-z0-9.-]{3,63}(\/.*)?$/, example: "arn:aws:s3:::my-query-logs" },
  firehose: { re: /^arn:aws:firehose:[a-z0-9-]+:\d{12}:deliverystream\/[\w.-]{1,64}$/, example: "arn:aws:firehose:us-east-1:123456789012:deliverystream/dns-logs" },
};

export const queryLoggingConfig: ResourceConfig = {
  route: "resolver-query-logging",
  api: "/resources/query_logging",
  title: "Query logging",
  singular: "query logging configuration",
  description: "Send the DNS queries made from your VPCs to CloudWatch Logs, S3 or Kinesis Data Firehose.",
  help: {
    summary: "A query logging configuration records the DNS queries made from the VPCs you associate with it.",
    points: ["Choose a destination type and paste its ARN.", "One configuration can serve several VPCs.", "Test record with a source VPC shows when a query would be logged."],
  },
  searchPlaceholder: "Filter configurations by name, ID or destination",
  filters: [{ key: "destination_type", label: "destinations", options: [{ value: "cloudwatch-logs", label: "CloudWatch Logs" }, { value: "s3", label: "S3 bucket" }, { value: "firehose", label: "Kinesis Data Firehose" }] }],
  columns: [
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "type", header: "Destination type", sortKey: "destination_type", cell: (i) => String(i.destination_type) },
    { id: "arn", header: "Destination ARN", cell: (i) => <span className="record-value">{String(i.destination_arn)}</span> },
    { id: "vpcs", header: "VPC count", cell: (i) => String(strs(i, "vpc_ids").length) },
    { id: "sharing", header: "Sharing status", cell: () => "Not shared" },
    { id: "created", header: "Creation time (UTC)", sortKey: "created_at", cell: (i) => String(i.created_at).replace("T", " ").slice(0, 19) },
  ],
  fields: [
    { type: "text", name: "name", label: "Configuration name", placeholder: "resolver-query-logs", validate: NAME_RULE },
    {
      type: "select", name: "destination_type", label: "Destination type",
      options: [{ value: "cloudwatch-logs", label: "CloudWatch Logs log group" }, { value: "s3", label: "S3 bucket" }, { value: "firehose", label: "Kinesis Data Firehose delivery stream" }],
    },
    {
      type: "text", name: "destination_arn", label: "Destination ARN", placeholder: ARN_RULES["cloudwatch-logs"].example,
      validate: (v, all) => {
        const rule = ARN_RULES[String(all.destination_type)];
        return rule && !rule.re.test(String(v).trim()) ? `Enter a valid ARN, for example ${rule.example}` : null;
      },
    },
    { type: "multiselect", name: "vpc_ids", label: "VPC associations", optional: true, source: "vpcs" },
  ],
  defaults: { destination_type: "cloudwatch-logs" },
  detailRows: [
    { label: "Configuration ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Destination type", value: (i) => String(i.destination_type) },
    { label: "Destination ARN", value: (i) => <span className="record-value">{String(i.destination_arn)}</span> },
  ],
  detailTabs: [{ id: "vpcs", label: (i) => `VPC associations (${strs(i, "vpc_ids").length})`, render: (i) => <BriefTable items={strs(i, "vpc_ids").map((id) => ({ id, name: id }))} noun="VPCs" /> }],
};
