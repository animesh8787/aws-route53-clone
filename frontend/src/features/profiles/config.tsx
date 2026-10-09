"use client";

import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import NextLink from "next/link";

import { StatusBadge } from "@/components/common/StatusBadge";
import type { ResourceConfig, ResourceItem } from "@/lib/resource-config";

const list = (item: ResourceItem, key: string) => (item[key] as string[] | undefined) ?? [];

const nameRule = (v: unknown) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.");

function IdTable({ title, ids, href }: { title: string; ids: string[]; href?: (id: string) => string }) {
  return (
    <Table
      variant="embedded"
      items={ids.map((id) => ({ id }))}
      trackBy="id"
      columnDefinitions={[{ id: "id", header: title, cell: (r) => (href ? <NextLink href={href(r.id)}>{r.id}</NextLink> : r.id) }]}
      empty={<Box textAlign="center" color="text-body-secondary">Nothing associated yet. Edit the profile to add associations.</Box>}
    />
  );
}

export const profileConfig: ResourceConfig = {
  route: "profiles",
  api: "/resources/profile",
  title: "Profiles",
  singular: "profile",
  description: "A profile bundles DNS settings (VPC associations, private hosted zones and resolver resources) so you can manage them together.",
  help: {
    summary: "Profiles let you apply a consistent set of DNS resources to many VPCs.",
    points: [
      "A VPC can belong to only one profile.",
      "Only private hosted zones can be associated with a profile.",
      "Resolver rules, DNS Firewall rule groups and query logging configurations can be shared through a profile.",
      "A profile cannot be deleted while it still has associations: remove them first.",
    ],
  },
  searchPlaceholder: "Filter profiles by name, ID or description",
  filters: [{ key: "status", label: "statuses", options: [{ value: "COMPLETE", label: "Complete" }, { value: "FAILED", label: "Failed" }] }],
  columns: [
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "Profile ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "vpcs", header: "VPCs", cell: (i) => String(list(i, "vpc_ids").length) },
    { id: "zones", header: "Hosted zones", cell: (i) => String(list(i, "zone_ids").length) },
    { id: "resources", header: "Resources", cell: (i) => String(list(i, "resource_ids").length) },
    { id: "description", header: "Description", hidden: true, cell: (i) => String(i.description || "-") },
  ],
  fields: [
    { type: "text", name: "name", label: "Profile name", placeholder: "production-dns", description: "A name that identifies the profile.", validate: nameRule },
    { type: "textarea", name: "description", label: "Description", optional: true, validate: (v) => (String(v).length > 256 ? "Description cannot exceed 256 characters." : null) },
    { type: "multiselect", name: "vpc_ids", label: "VPC associations", optional: true, source: "vpcs", description: "Each VPC can belong to only one profile." },
    { type: "multiselect", name: "zone_ids", label: "Private hosted zones", optional: true, source: "private-zones" },
    {
      type: "multiselect", name: "resource_ids", label: "Resolver and firewall resources", optional: true,
      source: "resources:resolver_rule,fw_rule_group,query_logging", description: "Resolver rules, DNS Firewall rule groups and query logging configurations.",
    },
  ],
  detailRows: [
    { label: "Profile ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Description", value: (i) => String(i.description || "-") },
    { label: "VPCs", value: (i) => String(list(i, "vpc_ids").length) },
    { label: "Private hosted zones", value: (i) => String(list(i, "zone_ids").length) },
    { label: "Resources", value: (i) => String(list(i, "resource_ids").length) },
  ],
  detailTabs: [
    { id: "vpcs", label: (i) => `VPC associations (${list(i, "vpc_ids").length})`, render: (i) => <IdTable title="VPC ID" ids={list(i, "vpc_ids")} /> },
    { id: "zones", label: (i) => `Hosted zones (${list(i, "zone_ids").length})`, render: (i) => <IdTable title="Hosted zone ID" ids={list(i, "zone_ids")} href={(id) => `/hosted-zones/${id}`} /> },
    {
      id: "resources",
      label: (i) => `Resources (${list(i, "resource_ids").length})`,
      render: (i) => (
        <SpaceBetween size="s">
          <IdTable title="Resource ID" ids={list(i, "resource_ids")} />
          <Link href="/resolver-rules">Manage resolver rules</Link>
        </SpaceBetween>
      ),
    },
  ],
};
