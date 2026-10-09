"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/common/StatusBadge";
import { PolicyDocumentField, PolicyTree, parseDocument } from "@/features/traffic-policies/PolicyDocument";
import { api } from "@/lib/api";
import type { Page } from "@/types/api";
import type { ResourceConfig, ResourceItem } from "@/lib/resource-config";

interface Version {
  version: number;
  document: Record<string, unknown>;
  comment: string;
  created_at: string;
}

const TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "PTR", "SRV", "TXT"].map((t) => ({ value: t, label: t }));
const versionsOf = (i: ResourceItem) => ((i.versions as Version[] | undefined) ?? []).slice().reverse();

function CreateRecordButton({ item }: { item: ResourceItem }) {
  const router = useRouter();
  return <Button onClick={() => router.push(`/policy-records/create?policy_id=${item.id}&policy_version=${item.latest_version}`)}>Create policy record</Button>;
}

function PolicyRecordsTab({ item }: { item: ResourceItem }) {
  const { data, isPending } = useQuery({
    queryKey: ["resource", "/resources/policy_record", "for-policy", item.id],
    queryFn: () => api.get<Page<ResourceItem>>("/resources/policy_record", { q: String(item.id), page_size: 100 }),
  });
  return (
    <Table
      variant="embedded"
      loading={isPending}
      loadingText="Loading policy records"
      items={(data?.items ?? []).filter((r) => r.policy_id === item.id)}
      trackBy="id"
      columnDefinitions={[
        { id: "name", header: "DNS name", cell: (r) => <NextLink href={`/policy-records/${r.id}`}>{r.name}</NextLink> },
        { id: "version", header: "Version", cell: (r) => String(r.policy_version) },
        { id: "zone", header: "Hosted zone", cell: (r) => String(r.zone_name) },
        { id: "records", header: "DNS records", cell: (r) => String(r.record_count) },
      ]}
      empty={<Box textAlign="center" color="text-body-secondary">No policy records use this policy yet.</Box>}
    />
  );
}

export const trafficPolicyConfig: ResourceConfig = {
  route: "traffic-policies",
  api: "/resources/traffic_policy",
  title: "Traffic policies",
  singular: "traffic policy",
  description: "Describe how traffic is routed between endpoints, then apply a policy version to a DNS name as a policy record.",
  help: {
    summary: "A traffic policy is a versioned JSON document: a DNS type, endpoints, and a rule (failover, weighted, latency, geo or multivalue) that chooses between them.",
    points: [
      "Saving a changed document creates a new version; older versions are kept.",
      "A policy has no effect until you create a policy record, which turns the policy into real DNS records in a hosted zone.",
      "Those records are managed by the policy record and cannot be edited on their own.",
      "Rules can point at endpoints only (no nesting) in this console.",
    ],
  },
  searchPlaceholder: "Filter policies by name or ID",
  filters: [{ key: "record_type", label: "DNS types", options: TYPES }],
  columns: [
    { id: "name", header: "Policy name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "Policy ID", cell: (i) => String(i.id) },
    { id: "type", header: "DNS type", sortKey: "record_type", cell: (i) => String(i.record_type) },
    { id: "version", header: "Latest version", cell: (i) => String(i.latest_version) },
    { id: "records", header: "Policy records", cell: (i) => String(i.policy_record_count) },
    { id: "description", header: "Description", hidden: true, cell: (i) => String(i.description || "-") },
  ],
  fields: [
    {
      type: "text", name: "name", label: "Policy name", placeholder: "web-failover", description: "A name that identifies the policy.",
      validate: (v) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit."),
    },
    { type: "select", name: "record_type", label: "DNS type", options: TYPES, disabledOnEdit: true, description: "The record type the policy answers with. It cannot change after creation." },
    { type: "text", name: "description", label: "Description", optional: true },
    {
      type: "custom", name: "document", label: "Policy document", render: (p) => <PolicyDocumentField {...p} />,
      validate: (v) => parseDocument(String(v)).error,
    },
    { type: "text", name: "version_comment", label: "Version comment", optional: true, description: "Describes what changed in this version." },
  ],
  defaults: { record_type: "A" },
  detailRows: [
    { label: "Policy ID", value: (i) => String(i.id) },
    { label: "DNS type", value: (i) => String(i.record_type) },
    { label: "Latest version", value: (i) => String(i.latest_version) },
    { label: "Policy records", value: (i) => String(i.policy_record_count) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Description", value: (i) => String(i.description || "-") },
  ],
  detailActions: (item) => <CreateRecordButton item={item} />,
  detailTabs: [
    {
      id: "document",
      label: () => "Latest document",
      render: (i) => {
        const { doc } = parseDocument(String(i.document));
        return (
          <SpaceBetween size="m">
            {doc && <PolicyTree doc={doc} />}
            <pre className="record-value" style={{ maxWidth: "100%", whiteSpace: "pre-wrap" }}>{String(i.document)}</pre>
          </SpaceBetween>
        );
      },
    },
    {
      id: "versions",
      label: (i) => `Versions (${i.version_count})`,
      render: (i) => (
        <Table
          variant="embedded"
          items={versionsOf(i)}
          trackBy="version"
          columnDefinitions={[
            { id: "v", header: "Version", cell: (v) => String(v.version) },
            { id: "at", header: "Created (UTC)", cell: (v) => v.created_at.replace("T", " ") },
            { id: "comment", header: "Comment", cell: (v) => v.comment || "-" },
            { id: "use", header: "Use", cell: (v) => <NextLink href={`/policy-records/create?policy_id=${i.id}&policy_version=${v.version}`}>Create policy record</NextLink> },
          ]}
        />
      ),
    },
    { id: "records", label: (i) => `Policy records (${i.policy_record_count})`, render: (i) => <PolicyRecordsTab item={i} /> },
  ],
  deleteWarning: (i) => (Number(i.policy_record_count) > 0 ? "This policy is used by policy records. Deletion is blocked until they are removed." : null),
};
