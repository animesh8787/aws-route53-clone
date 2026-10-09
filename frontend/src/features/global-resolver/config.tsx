"use client";

import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Icon, { type IconProps } from "@cloudscape-design/components/icon";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";

import { StatusBadge } from "@/components/common/StatusBadge";
import { AWS_REGIONS } from "@/lib/record-config";
import type { ResourceConfig, ResourceItem } from "@/lib/resource-config";

const NAME_RULE = (v: unknown) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.");
const strs = (i: ResourceItem, key: string) => (i[key] as string[] | undefined) ?? [];
const yesNo = (v: unknown) => (v ? "Enabled" : "Disabled");
const REGION_OPTIONS = AWS_REGIONS.map((r) => ({ value: r, label: r }));

const STEPS: { icon: IconProps.Name; title: string; text: string }[] = [
  { icon: "globe", title: "Step 1: Create global resolver", text: "Create a global resolver instance in your preferred AWS Regions, with recommended security settings." },
  { icon: "key", title: "Step 2: Specify access rules", text: "Create DNS views and specify access sources, access tokens, and DNS Firewall rules to manage DNS queries and define how to filter DNS network traffic." },
  { icon: "security", title: "Step 3: Configure DNS filtering", text: "Set up security policies and domain lists to block malicious domains and control DNS resolution for your organization." },
];

function GettingStarted() {
  return (
    <ExpandableSection variant="container" defaultExpanded headerText="Getting started with global resolver">
      <SpaceBetween size="m">
        <ColumnLayout columns={3} borders="vertical">
          {STEPS.map((s) => (
            <SpaceBetween key={s.title} size="xs">
              <Icon name={s.icon} size="large" variant="link" />
              <Box variant="h3" padding="n">
                {s.title}
              </Box>
              <Box>{s.text}</Box>
            </SpaceBetween>
          ))}
        </ColumnLayout>
        <Box textAlign="right">
          Learn more at{" "}
          <Link href="https://docs.aws.amazon.com/route53/" external>
            Global Resolver homepage
          </Link>
        </Box>
      </SpaceBetween>
    </ExpandableSection>
  );
}

// ------------------------------------------------------------------ global resolvers
export const globalResolverConfig: ResourceConfig = {
  route: "global-resolvers",
  api: "/resources/global_resolver",
  title: "Global resolvers",
  singular: "global resolver",
  description: "Global resolver allows you to securely resolve domains for your public applications on the internet and in Route 53 private hosted zones.",
  help: {
    summary: "A global resolver is an anycast DNS resolver that serves clients from several AWS Regions at once.",
    points: [
      "Each resolver gets two anycast IPv4 addresses (and IPv6 addresses for dual-stack) plus a DNS name.",
      "Choose the Regions that serve queries and one Region that receives metrics and logs (observability Region).",
      "Addresses here are simulated; nothing answers queries on the internet.",
    ],
  },
  intro: <GettingStarted />,
  searchPlaceholder: "Find global resolvers",
  filters: [{ key: "status", label: "statuses", options: [{ value: "OPERATIONAL", label: "Operational" }, { value: "CREATING", label: "Creating" }] }],
  columns: [
    { id: "name", header: "Resolver name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "Resolver ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "description", header: "Description", cell: (i) => String(i.description || "-") },
    { id: "observability", header: "Observability region", sortKey: "observability_region", cell: (i) => String(i.observability_region) },
    { id: "regions", header: "Regions", cell: (i) => strs(i, "regions").join(", ") },
    { id: "ipv4", header: "IPv4 addresses", cell: (i) => strs(i, "ipv4_addresses").join(", ") || "-" },
    { id: "ipv6", header: "IPv6 addresses", cell: (i) => strs(i, "ipv6_addresses").join(", ") || "-" },
    { id: "dns", header: "DNS name", hidden: true, cell: (i) => String(i.dns_name) },
  ],
  fields: [
    { type: "text", name: "name", label: "Resolver name", placeholder: "corp-global-resolver", validate: NAME_RULE },
    { type: "textarea", name: "description", label: "Description", optional: true, validate: (v) => (String(v).length > 256 ? "Description cannot exceed 256 characters." : null) },
    { type: "multiselect", name: "regions", label: "Regions", description: "Regions whose anycast locations answer queries (up to 10).", options: REGION_OPTIONS, validate: (v) => (Array.isArray(v) && v.length ? (v.length > 10 ? "Choose at most 10 Regions." : null) : "Choose at least one Region.") },
    { type: "select", name: "observability_region", label: "Observability Region", description: "Region that receives metrics and query logs.", options: REGION_OPTIONS },
    {
      type: "select", name: "ip_address_type", label: "IP address type",
      options: [{ value: "IPV4", label: "IPv4", description: "Two anycast IPv4 addresses" }, { value: "DUALSTACK", label: "Dual-stack", description: "IPv4 and IPv6 anycast addresses" }],
    },
  ],
  defaults: { name: "", description: "", regions: ["us-east-1", "eu-west-1"], observability_region: "us-east-1", ip_address_type: "IPV4" },
  detailRows: [
    { label: "Resolver ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "ARN", value: (i) => String(i.arn) },
    { label: "DNS name", value: (i) => String(i.dns_name) },
    { label: "IPv4 addresses", value: (i) => strs(i, "ipv4_addresses").join(", ") },
    { label: "IPv6 addresses", value: (i) => strs(i, "ipv6_addresses").join(", ") || "-" },
    { label: "Regions", value: (i) => strs(i, "regions").join(", ") },
    { label: "Observability Region", value: (i) => String(i.observability_region) },
    { label: "Description", value: (i) => String(i.description || "-") },
  ],
};

// ------------------------------------------------------------------ shared DNS views (read-only)
export const sharedDnsViewConfig: ResourceConfig = {
  route: "shared-dns-views",
  api: "/resources/shared_dns_view",
  title: "Shared DNS views",
  singular: "DNS view",
  description: "DNS views that have been shared with your account through AWS Resource Access Manager (RAM).",
  help: {
    summary: "A DNS view decides how a global resolver answers a group of clients. Other accounts can share their views with you through AWS RAM.",
    points: ["Shared views are read-only: their owner changes them.", "DNSSEC validation, EDNS client subnet and firewall fail-open are settings of the view."],
  },
  readOnly: true,
  searchPlaceholder: "Find shared DNS views",
  columns: [
    { id: "name", header: "DNS view name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "DNS view ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "description", header: "Description", cell: (i) => String(i.description || "-") },
    { id: "dnssec", header: "DNSSEC validation", cell: (i) => yesNo(i.dnssec_validation) },
    { id: "ecs", header: "EDNS client subnet", cell: (i) => yesNo(i.edns_client_subnet) },
    { id: "failopen", header: "Firewall rules fail open", cell: (i) => yesNo(i.firewall_fail_open) },
    { id: "owner", header: "Owner ID", cell: (i) => String(i.owner_account_id) },
  ],
  fields: [],
  detailRows: [
    { label: "DNS view ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Owner ID", value: (i) => String(i.owner_account_id) },
    { label: "Description", value: (i) => String(i.description || "-") },
    { label: "DNSSEC validation", value: (i) => yesNo(i.dnssec_validation) },
    { label: "EDNS client subnet", value: (i) => yesNo(i.edns_client_subnet) },
    { label: "Firewall rules fail open", value: (i) => yesNo(i.firewall_fail_open) },
  ],
};

// ------------------------------------------------------------------ Resolver on Outposts
const OUTPOST_ARN_RE = /^arn:aws:outposts:[a-z]{2}-[a-z]+-\d:\d{12}:outpost\/op-[0-9a-f]{17}$/;

export const outpostResolverConfig: ResourceConfig = {
  route: "resolver-outposts",
  api: "/resources/resolver_outpost",
  title: "Resolver on Outpost",
  singular: "Resolver",
  createLabel: "Create Resolver",
  description: "Run Route 53 Resolver on your AWS Outposts racks so that DNS queries are answered locally.",
  help: {
    summary: "Resolver on Outposts runs Resolver instances on an Outpost so that applications there keep resolving names even when the connection to the Region is interrupted.",
    points: ["Choose the Outpost by ARN and the number of Resolver instances (4 to 12).", "The Outpost and its instances are simulated in this console."],
  },
  searchPlaceholder: "Find resource",
  columns: [
    { id: "id", header: "Resolver ID", cell: (i) => String(i.id) },
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "outpost", header: "Outpost ID", cell: (i) => String(i.outpost_id) },
    { id: "generation", header: "Outpost generation", cell: (i) => String(i.outpost_generation) },
    { id: "instances", header: "Instance count", cell: (i) => String(i.instance_count) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "endpoints", header: "Endpoint count", cell: (i) => String(i.endpoint_count) },
    { id: "type", header: "Type", cell: (i) => String(i.preferred_instance_type) },
    { id: "az", header: "Availability Zone ID", cell: (i) => String(i.availability_zone_id) },
  ],
  fields: [
    { type: "text", name: "name", label: "Name", placeholder: "factory-outpost-resolver", validate: NAME_RULE },
    {
      type: "text", name: "outpost_arn", label: "Outpost ARN", placeholder: "arn:aws:outposts:us-east-1:123456789012:outpost/op-0123456789abcdef0",
      validate: (v) => (OUTPOST_ARN_RE.test(String(v).trim()) ? null : "Enter an Outpost ARN such as arn:aws:outposts:us-east-1:123456789012:outpost/op-0123456789abcdef0."),
    },
    { type: "number", name: "instance_count", label: "Instance count", description: "Number of Resolver instances on the Outpost (4-12).", min: 4, max: 12 },
    { type: "text", name: "preferred_instance_type", label: "Preferred instance type", placeholder: "m5.large", validate: (v) => (/^[a-z][a-z0-9]*\.[a-z0-9]+$/.test(String(v).trim()) ? null : "Enter an instance type such as m5.large.") },
  ],
  defaults: { name: "", outpost_arn: "", instance_count: 4, preferred_instance_type: "m5.large" },
  detailRows: [
    { label: "Resolver ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Outpost ARN", value: (i) => String(i.outpost_arn) },
    { label: "Outpost ID", value: (i) => String(i.outpost_id) },
    { label: "Availability Zone ID", value: (i) => String(i.availability_zone_id) },
    { label: "Instance count", value: (i) => String(i.instance_count) },
    { label: "Preferred instance type", value: (i) => String(i.preferred_instance_type) },
  ],
};
