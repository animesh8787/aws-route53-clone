"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";

import { StatusBadge } from "@/components/common/StatusBadge";
import { useFlash } from "@/components/layout/FlashProvider";
import { api } from "@/lib/api";
import { validateHostname, validateInt, validateIPv4, validateIPv6 } from "@/lib/dns-validation";
import type { ResourceConfig, ResourceItem } from "@/lib/resource-config";

const REGIONS = ["us-east-1", "us-west-1", "us-west-2", "eu-west-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1"];
const TYPES = [
  { value: "HTTP", label: "HTTP", description: "Request a path over HTTP and expect a 2xx or 3xx response" },
  { value: "HTTPS", label: "HTTPS", description: "Request a path over HTTPS and expect a 2xx or 3xx response" },
  { value: "HTTP_STR_MATCH", label: "HTTP with string matching", description: "HTTP check that also looks for a string in the first 5,120 bytes" },
  { value: "HTTPS_STR_MATCH", label: "HTTPS with string matching", description: "HTTPS check that also looks for a string in the first 5,120 bytes" },
  { value: "TCP", label: "TCP", description: "Succeeds when a TCP connection can be established" },
];
const typeLabel = (t: unknown) => TYPES.find((x) => x.value === t)?.label ?? String(t);
const isMatch = (v: Record<string, unknown>) => String(v.type).endsWith("STR_MATCH");

interface UsedRecord {
  id: number;
  name: string;
  type: string;
  routing_policy: string;
  set_identifier: string;
  zone_id: string;
  zone_name: string;
}

function useToggleStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: "HEALTHY" | "UNHEALTHY") => api.patch(`/health-checks/${id}/status`, { status }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["resource"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]),
  });
}

function ToggleButton({ item, refresh }: { item: ResourceItem; refresh: () => void }) {
  const flash = useFlash();
  const toggle = useToggleStatus(String(item.health_check_id));
  const next = item.status === "HEALTHY" ? "UNHEALTHY" : "HEALTHY";
  return (
    <Button
      loading={toggle.isPending}
      onClick={() =>
        toggle.mutate(next, {
          onSuccess: () => {
            flash("success", `${item.name} is now ${next.toLowerCase()} (simulated).`);
            refresh();
          },
        })
      }
    >
      Mark as {next.toLowerCase()}
    </Button>
  );
}

function Monitoring({ item }: { item: ResourceItem }) {
  const history = (item.history as { status: string; at: string; note: string }[]) ?? [];
  return (
    <SpaceBetween size="m">
      <Box color="text-body-secondary">
        Health checks here are simulated: nothing probes the endpoint. Change the status by hand to see failover, multivalue and the DNS test tool react.
      </Box>
      <Table
        variant="embedded"
        items={history}
        trackBy="at"
        columnDefinitions={[
          { id: "status", header: "Status", cell: (h) => <StatusBadge status={h.status} /> },
          { id: "at", header: "When (UTC)", cell: (h) => h.at.replace("T", " ") },
          { id: "note", header: "Note", cell: (h) => h.note || "-" },
        ]}
        empty={<Box textAlign="center">No status changes yet.</Box>}
      />
    </SpaceBetween>
  );
}

function UsedBy({ item }: { item: ResourceItem }) {
  const { data, isPending } = useQuery({ queryKey: ["resource", "/health-checks", "records", item.health_check_id], queryFn: () => api.get<UsedRecord[]>(`/health-checks/${item.health_check_id}/records`) });
  return (
    <Table
      variant="embedded"
      loading={isPending}
      loadingText="Loading records"
      items={data ?? []}
      trackBy="id"
      columnDefinitions={[
        { id: "name", header: "Record name", cell: (r) => <NextLink href={`/hosted-zones/${r.zone_id}/records/${r.id}/edit`}>{r.name.replace(/\.$/, "")}</NextLink> },
        { id: "type", header: "Type", cell: (r) => r.type },
        { id: "policy", header: "Routing policy", cell: (r) => r.routing_policy },
        { id: "zone", header: "Hosted zone", cell: (r) => <Link href={`/hosted-zones/${r.zone_id}`}>{r.zone_name}</Link> },
      ]}
      empty={<Box textAlign="center">No records use this health check. Attach it from the record editor (Routing &gt; Health check).</Box>}
    />
  );
}

export const healthCheckConfig: ResourceConfig = {
  route: "health-checks",
  api: "/health-checks",
  idField: "health_check_id",
  title: "Health checks",
  singular: "health check",
  description: "Monitor the health of your endpoints and use the result to route traffic away from unhealthy resources.",
  help: {
    summary: "Health checks decide whether an endpoint is healthy. Failover and multivalue answer records skip unhealthy targets.",
    points: [
      "Choose HTTP, HTTPS or TCP and the endpoint (IP address or domain name).",
      "String matching checks also look for text in the response body.",
      "Attach a health check to a record in the record editor under Routing.",
      "In this console the status is simulated: use Mark as healthy / unhealthy to change it.",
    ],
  },
  searchPlaceholder: "Filter health checks by name, endpoint or ID",
  filters: [
    { key: "status", label: "statuses", options: [{ value: "healthy", label: "Healthy" }, { value: "unhealthy", label: "Unhealthy" }] },
    { key: "type", label: "types", options: TYPES.map((t) => ({ value: t.value, label: t.label })) },
  ],
  columns: [
    { id: "id", header: "ID", cell: (i) => String(i.health_check_id) },
    { id: "name", header: "Name", sortKey: "name", link: true, cell: (i) => i.name },
    { id: "status", header: "State", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "details", header: "Details", cell: (i) => `${typeLabel(i.type)} ${i.endpoint}:${i.port}${i.path ?? ""}` },
    { id: "type", header: "Type", sortKey: "type", hidden: true, cell: (i) => typeLabel(i.type) },
    { id: "interval", header: "Interval", hidden: true, cell: (i) => `${i.request_interval}s` },
    { id: "records", header: "Used by records", hidden: true, cell: (i) => String(i.record_count) },
    { id: "created", header: "Created", sortKey: "created_at", hidden: true, cell: (i) => new Date(String(i.created_at).endsWith("Z") ? String(i.created_at) : `${i.created_at}Z`).toLocaleDateString() },
  ],
  defaults: { type: "HTTP", port: "80", path: "/", request_interval: "30", failure_threshold: "3" },
  fields: [
    { type: "text", name: "name", label: "Name", description: "A name that helps you recognise this health check.", placeholder: "web-primary", validate: (v) => (String(v).length > 100 ? "Name cannot exceed 100 characters." : null) },
    { type: "select", name: "type", label: "Protocol", options: TYPES, description: "How Route 53 checks the endpoint." },
    {
      type: "text", name: "endpoint", label: "Endpoint (IP address or domain name)", placeholder: "192.0.2.44 or www.example.com",
      validate: (v) => {
        const s = String(v).trim().toLowerCase().replace(/\.$/, "");
        return !validateIPv4(s) || !validateIPv6(s) || !validateHostname(s, "Endpoint") ? null : "Enter an IPv4 address, an IPv6 address or a domain name.";
      },
    },
    { type: "number", name: "port", label: "Port", validate: (v) => validateInt(v, "Port", 1, 65535) },
    { type: "text", name: "path", label: "Path", placeholder: "/health", visibleWhen: (v) => v.type !== "TCP", validate: (v) => (String(v).startsWith("/") ? null : "Path must start with /.") },
    { type: "text", name: "search_string", label: "Search string", description: "The text that must appear in the response.", visibleWhen: isMatch },
    { type: "select", name: "request_interval", label: "Request interval", options: [{ value: "30", label: "Standard (30 seconds)" }, { value: "10", label: "Fast (10 seconds)" }] },
    { type: "number", name: "failure_threshold", label: "Failure threshold", description: "Consecutive failures before the endpoint is considered unhealthy.", validate: (v) => validateInt(v, "Failure threshold", 1, 10) },
    {
      type: "multiselect", name: "regions", label: "Health checker regions", optional: true, options: REGIONS.map((r) => ({ value: r, label: r })),
      description: "Leave empty to use all regions, or choose at least three.", validate: (v) => (Array.isArray(v) && v.length > 0 && v.length < 3 ? "Choose at least three regions, or none." : null),
    },
    { type: "toggle", name: "inverted", label: "Invert health check status", toggleLabel: "Invert health check status", description: "Treat a failing check as healthy and vice versa." },
    { type: "toggle", name: "disabled", label: "Disable health check", toggleLabel: "Disable health check", description: "A disabled check is always treated as healthy." },
  ],
  toPayload: (v) => ({ ...v, request_interval: Number(v.request_interval) }),
  toForm: (i) => ({ ...i, port: String(i.port), request_interval: String(i.request_interval), failure_threshold: String(i.failure_threshold), regions: i.regions ?? [] }),
  detailRows: [
    { label: "Health check ID", value: (i) => String(i.health_check_id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Protocol", value: (i) => typeLabel(i.type) },
    { label: "Endpoint", value: (i) => `${i.endpoint}:${i.port}` },
    { label: "Path", value: (i) => (i.path ? String(i.path) : "-") },
    { label: "Search string", value: (i) => (i.search_string ? String(i.search_string) : "-") },
    { label: "Request interval", value: (i) => `${i.request_interval} seconds` },
    { label: "Failure threshold", value: (i) => String(i.failure_threshold) },
    { label: "Regions", value: (i) => ((i.regions as string[]).length ? (i.regions as string[]).join(", ") : "All regions") },
    { label: "Inverted", value: (i) => (i.inverted ? "Yes" : "No") },
    { label: "Disabled", value: (i) => (i.disabled ? "Yes" : "No") },
  ],
  detailActions: (item, refresh) => <ToggleButton item={item} refresh={refresh} />,
  splitPanel: {
    emptyHeader: "Select a health check",
    emptyText: "Select a health check in the table to see its details and latest status here.",
    render: (i) => (
      <SpaceBetween size="m">
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Health check ID</Box>
            <div>{String(i.health_check_id)}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Status</Box>
            <StatusBadge status={i.status} />
          </div>
          <div>
            <Box variant="awsui-key-label">Monitors</Box>
            <div>
              {typeLabel(i.type)} {String(i.endpoint)}:{String(i.port)}
              {i.path ? String(i.path) : ""}
            </div>
          </div>
          <div>
            <Box variant="awsui-key-label">Used by records</Box>
            <div>{String(i.record_count)}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Request interval</Box>
            <div>{String(i.request_interval)} seconds</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Failure threshold</Box>
            <div>{String(i.failure_threshold)}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Regions</Box>
            <div>{(i.regions as string[]).length ? (i.regions as string[]).join(", ") : "All regions"}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Inverted / disabled</Box>
            <div>
              {i.inverted ? "Yes" : "No"} / {i.disabled ? "Yes" : "No"}
            </div>
          </div>
        </ColumnLayout>
        <NextLink href={`/health-checks/${String(i.health_check_id)}`}>View monitoring and history</NextLink>
      </SpaceBetween>
    ),
  },
  detailTabs: [
    { id: "monitoring", label: () => "Monitoring", render: (i) => <Monitoring item={i} /> },
    { id: "records", label: (i) => `Records (${i.record_count})`, render: (i) => <UsedBy item={i} /> },
  ],
  deleteWarning: (i) => (Number(i.record_count) > 0 ? `${i.record_count} record(s) use this health check. They will keep working but will no longer be health checked.` : null),
};
