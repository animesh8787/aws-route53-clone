"use client";

import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import Table from "@cloudscape-design/components/table";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { api } from "@/lib/api";
import { validateTtl } from "@/lib/dns-validation";
import type { CustomFieldProps, ResourceConfig, ResourceItem } from "@/lib/resource-config";
import type { DnsRecord, Page } from "@/types/api";

/** Version picker: lists the versions of the chosen policy and preselects ?policy_version= when given. */
function PolicyVersionField({ value, values, onChange, error }: CustomFieldProps) {
  const policyId = String(values.policy_id ?? "");
  const wanted = useSearchParams().get("policy_version");
  const { data, isFetching } = useQuery({
    queryKey: ["resource", "/resources/traffic_policy", "detail", policyId],
    queryFn: () => api.get<ResourceItem>(`/resources/traffic_policy/${policyId}`),
    enabled: !!policyId,
  });
  const versions = ((data?.versions as { version: number; comment: string; created_at: string }[] | undefined) ?? []).slice().reverse();
  const options = versions.map((v) => ({ value: String(v.version), label: `Version ${v.version}`, description: v.comment || v.created_at.replace("T", " ") }));
  useEffect(() => {
    if (!versions.length) return;
    const current = String(value ?? "");
    if (!current || !options.some((o) => o.value === current)) onChange(options.find((o) => o.value === wanted)?.value ?? options[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  return (
    <FormField label="Policy version" description="Which version of the policy to apply." errorText={error} stretch>
      <Select
        selectedOption={options.find((o) => o.value === String(value ?? "")) ?? null}
        options={options}
        onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
        statusType={isFetching ? "loading" : "finished"}
        placeholder={policyId ? "Choose a version" : "Choose a policy first"}
        disabled={!policyId}
        invalid={!!error}
        ariaLabel="Policy version"
      />
    </FormField>
  );
}

function ManagedRecords({ item }: { item: ResourceItem }) {
  const { data, isPending } = useQuery({
    queryKey: ["records", "managed", item.id],
    queryFn: () => api.get<Page<DnsRecord>>(`/hosted-zones/${item.zone_id}/records`, { q: String(item.name).split(".")[0], page_size: 100 }),
  });
  const rows = (data?.items ?? []).filter((r) => r.policy_record_id === item.id);
  return (
    <Table
      variant="embedded"
      loading={isPending}
      loadingText="Loading records"
      items={rows}
      trackBy="id"
      columnDefinitions={[
        { id: "name", header: "Record name", cell: (r) => r.name.replace(/\.$/, "") },
        { id: "type", header: "Type", cell: (r) => r.type },
        { id: "policy", header: "Routing policy", cell: (r) => r.routing_policy },
        { id: "id", header: "Record ID", cell: (r) => r.set_identifier || "-" },
        { id: "value", header: "Value", cell: (r) => (r.alias ? `Alias to ${r.alias.target}` : r.values.join(", ")) },
      ]}
      empty={<Box textAlign="center" color="text-body-secondary">No records.</Box>}
    />
  );
}

export const policyRecordConfig: ResourceConfig = {
  route: "policy-records",
  api: "/resources/policy_record",
  title: "Policy records",
  singular: "policy record",
  description: "Apply a traffic policy version to a DNS name. The policy is turned into real DNS records in the hosted zone.",
  help: {
    summary: "A policy record connects a DNS name in a hosted zone to a traffic policy version.",
    points: [
      "Creating one adds the records that implement the policy (for example a PRIMARY and a SECONDARY failover record).",
      "Those records show a Traffic policy badge and are changed only through the policy record.",
      "Changing the policy version replaces the records; deleting the policy record removes them.",
    ],
  },
  searchPlaceholder: "Filter policy records by DNS name, zone or policy",
  columns: [
    { id: "name", header: "DNS name", sortKey: "name", cell: (i) => i.name },
    { id: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "type", header: "DNS type", cell: (i) => String(i.record_type) },
    { id: "policy", header: "Traffic policy", cell: (i) => String(i.policy_name) },
    { id: "version", header: "Version", cell: (i) => String(i.policy_version) },
    { id: "vdesc", header: "Version description", cell: (i) => String(i.version_comment || "-") },
    { id: "ttl", header: "TTL (in seconds)", cell: (i) => String(i.ttl) },
    { id: "zoneid", header: "Hosted zone ID", cell: (i) => String(i.zone_id) },
    { id: "id", header: "Policy record ID", hidden: true, cell: (i) => String(i.id) },
    { id: "zone", header: "Hosted zone", hidden: true, cell: (i) => String(i.zone_name) },
    { id: "records", header: "DNS records", hidden: true, cell: (i) => String(i.record_count) },
  ],
  fields: [
    { type: "select", name: "zone_id", label: "Hosted zone", source: "zones", disabledOnEdit: true, description: "Where the DNS name lives." },
    { type: "text", name: "dns_name", label: "DNS name", optional: true, placeholder: "www (leave empty for the zone apex)", disabledOnEdit: true, description: "A name relative to the zone, or a full name inside it." },
    { type: "select", name: "policy_id", label: "Traffic policy", source: "resources:traffic_policy", description: "The policy to apply." },
    { type: "custom", name: "policy_version", label: "Policy version", render: (p) => <PolicyVersionField {...p} />, validate: (v) => (v ? null : "Choose a policy version.") },
    { type: "number", name: "ttl", label: "TTL (seconds)", validate: (v) => validateTtl(v) },
  ],
  defaults: { ttl: "60" },
  toForm: (i) => ({ zone_id: i.zone_id, dns_name: String(i.dns_name).replace(new RegExp(`\\.?${String(i.zone_name).replace(/\./g, "\\.")}\\.$`), ""), policy_id: i.policy_id, policy_version: String(i.policy_version), ttl: String(i.ttl) }),
  toPayload: (v) => ({ ...v, policy_version: Number(v.policy_version) }),
  detailRows: [
    { label: "Policy record ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "DNS name", value: (i) => String(i.name) },
    { label: "Hosted zone", value: (i) => <Link href={`/hosted-zones/${i.zone_id}`}>{String(i.zone_name)}</Link> },
    { label: "Traffic policy", value: (i) => <NextLink href={`/traffic-policies/${i.policy_id}`}>{String(i.policy_name)}</NextLink> },
    { label: "Version", value: (i) => String(i.policy_version) },
    { label: "DNS type", value: (i) => String(i.record_type) },
    { label: "TTL", value: (i) => `${i.ttl} seconds` },
  ],
  detailTabs: [{ id: "records", label: (i) => `DNS records (${i.record_count})`, render: (i) => <ManagedRecords item={i} /> }],
  deleteWarning: (i) => `Deleting this policy record also removes its ${i.record_count} DNS record(s) from ${i.zone_name}.`,
};
