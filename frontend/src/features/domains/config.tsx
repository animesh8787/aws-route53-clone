"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { useFlash } from "@/components/layout/FlashProvider";
import { ApiError, api } from "@/lib/api";
import { validateHostname, validateInt } from "@/lib/dns-validation";
import type { ResourceConfig, ResourceItem } from "@/lib/resource-config";
import type { Page } from "@/types/api";

const date = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "-");
const yesNo = (v: unknown) => (v ? "Enabled" : "Disabled");

function ExpiryCell({ item }: { item: ResourceItem }) {
  const days = Number(item.days_to_expiry);
  return (
    <span>
      {date(item.expires_at)}{" "}
      {days < 0 ? <StatusBadge status="EXPIRED" /> : item.expiring_soon ? <Box variant="small" color="text-status-warning" display="inline">({days} days left)</Box> : null}
    </span>
  );
}

function useDomainAction<T>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body?: unknown) => api.post<T>(path, body),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["resource"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]),
  });
}

function RenewButton({ item, refresh }: { item: ResourceItem; refresh: () => void }) {
  const flash = useFlash();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState("1");
  const renew = useDomainAction(`/domains/${item.id}/renew`);
  const error = validateInt(years, "Years", 1, 10);
  const price = (Number(years) || 0) * 14;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Renew domain</Button>
      <Modal
        visible={open}
        onDismiss={() => { setOpen(false); renew.reset(); }}
        header={`Renew ${item.name}`}
        closeAriaLabel="Close dialog"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={renew.isPending}
                disabled={!!error}
                onClick={() => renew.mutate({ years: Number(years) }, { onSuccess: () => { flash("success", `${item.name} was renewed for ${years} year(s) (simulated, nothing was charged).`); setOpen(false); refresh(); } })}
              >
                Renew
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {renew.error && <Alert type="error">{renew.error instanceof ApiError ? renew.error.detail : "Unable to renew the domain."}</Alert>}
          <Box>Current expiry: {date(item.expires_at)}. This is a simulation: no payment is taken.</Box>
          <FormField label="Renewal period (years)" description={`Estimated price: about $${price.toFixed(2)} (simulated)`} errorText={error ?? undefined}>
            <Input type="number" inputMode="numeric" value={years} onChange={({ detail }) => setYears(detail.value)} invalid={!!error} ariaLabel="Renewal years" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}

function TransferButton({ item, refresh }: { item: ResourceItem; refresh: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const transfer = useDomainAction<{ auth_code: string }>(`/domains/${item.id}/transfer-out`);
  return (
    <>
      <Button
        loading={transfer.isPending}
        onClick={() => transfer.mutate(undefined, { onSuccess: (r) => { setCode(r.auth_code); refresh(); } })}
      >
        Transfer out
      </Button>
      {transfer.error && (
        <Modal visible onDismiss={() => transfer.reset()} header="Unable to start the transfer" closeAriaLabel="Close dialog">
          {transfer.error instanceof ApiError ? transfer.error.detail : "Something went wrong."}
        </Modal>
      )}
      <Modal visible={!!code} onDismiss={() => setCode(null)} header={`Authorization code for ${item.name}`} closeAriaLabel="Close dialog">
        <SpaceBetween size="s">
          <Box>Give this code to the registrar you are transferring the domain to.</Box>
          <Box variant="code" fontSize="heading-m">{code}</Box>
          <Box color="text-body-secondary">Simulated: no real transfer takes place.</Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export const domainConfig: ResourceConfig = {
  route: "registered-domains",
  api: "/resources/domain",
  title: "Registered domains",
  singular: "domain",
  description: "Domains you registered through Route 53. Registration creates a public hosted zone automatically (simulated: nothing is purchased).",
  help: {
    summary: "Registered domains show the domains you own, when they expire and how they are configured.",
    points: [
      "Register domain searches for a name, collects contact details and creates the domain and its hosted zone.",
      "Auto-renew keeps a domain from expiring; the transfer lock blocks transfers away from this registrar.",
      "Renew extends the expiry date; Transfer out gives you an authorization code (turn the lock off first).",
      "All of this is simulated: availability and prices are deterministic samples and nothing is charged.",
    ],
  },
  searchPlaceholder: "Filter domains by name",
  createLabel: "Register domain",
  createHref: "/registered-domains/register",
  noDelete: true,
  columns: [
    { id: "name", header: "Domain name", sortKey: "name", cell: (i) => i.name },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "expires", header: "Expiration date", sortKey: "expires_at", cell: (i) => <ExpiryCell item={i} /> },
    { id: "autorenew", header: "Auto-renew", cell: (i) => yesNo(i.auto_renew) },
    { id: "lock", header: "Transfer lock", cell: (i) => yesNo(i.transfer_lock) },
    { id: "zone", header: "Hosted zone", cell: (i) => (i.zone_id ? <Link href={`/hosted-zones/${i.zone_id}`}>{String(i.zone_name ?? i.zone_id)}</Link> : "-") },
    { id: "registered", header: "Registered", hidden: true, cell: (i) => date(i.registered_at) },
  ],
  fields: [
    { type: "text", name: "name", label: "Domain name", disabledOnEdit: true },
    { type: "toggle", name: "auto_renew", label: "Auto-renew", toggleLabel: "Auto-renew", description: "Renew the domain automatically before it expires." },
    { type: "toggle", name: "transfer_lock", label: "Transfer lock", toggleLabel: "Transfer lock", description: "Prevents the domain from being transferred to another registrar." },
    { type: "toggle", name: "privacy_protection", label: "Privacy protection", toggleLabel: "Privacy protection", description: "Hides your contact details from public WHOIS lookups." },
    {
      type: "lines", name: "name_servers", label: "Name servers", optional: true, description: "One per line, 2 to 6 servers. Leave empty to use the hosted zone's name servers.",
      validate: (v) => {
        const lines = (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
        if (lines.length === 0) return null;
        if (lines.length < 2 || lines.length > 6) return "Provide between 2 and 6 name servers.";
        for (const l of lines) {
          const problem = validateHostname(l, "Name server");
          if (problem) return `${l}: ${problem}`;
        }
        return null;
      },
    },
  ],
  toForm: (i) => ({ name: i.name, auto_renew: i.auto_renew, transfer_lock: i.transfer_lock, privacy_protection: i.privacy_protection, name_servers: i.name_servers ?? [] }),
  detailRows: [
    { label: "Domain ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Expiration date", value: (i) => <ExpiryCell item={i} /> },
    { label: "Registered on", value: (i) => date(i.registered_at) },
    { label: "Auto-renew", value: (i) => yesNo(i.auto_renew) },
    { label: "Transfer lock", value: (i) => yesNo(i.transfer_lock) },
    { label: "Privacy protection", value: (i) => yesNo(i.privacy_protection) },
    { label: "Hosted zone", value: (i) => (i.zone_id ? <NextLink href={`/hosted-zones/${i.zone_id}`}>{String(i.zone_name ?? i.zone_id)}</NextLink> : "-") },
    { label: "Name servers", value: (i) => <SpaceBetween size="xxs">{((i.name_servers as string[]) ?? []).map((n) => <span key={n} className="record-value">{n}</span>)}</SpaceBetween> },
  ],
  detailActions: (item, refresh) => (
    <SpaceBetween direction="horizontal" size="xs">
      <TransferButton item={item} refresh={refresh} />
      <RenewButton item={item} refresh={refresh} />
    </SpaceBetween>
  ),
  detailTabs: [
    {
      id: "contact",
      label: () => "Contact information",
      render: (i) => {
        const c = (i.contact as Record<string, string>) ?? {};
        const rows: [string, string][] = [
          ["Name", `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()], ["Organization", c.organization ?? ""], ["Email", c.email ?? ""], ["Phone", c.phone ?? ""],
          ["Address", [c.address_line, c.city, c.state, c.zip_code, c.country].filter(Boolean).join(", ")],
        ];
        return (
          <Table
            variant="embedded"
            items={rows.map(([k, val]) => ({ k, val }))}
            trackBy="k"
            columnDefinitions={[{ id: "k", header: "Field", cell: (r) => r.k }, { id: "v", header: "Value", cell: (r) => r.val || "-" }]}
          />
        );
      },
    },
    { id: "requests", label: () => "Requests", render: (i) => <DomainRequests name={String(i.name)} /> },
  ],
};

function DomainRequests({ name }: { name: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["resource", "/resources/domain_request", "for", name],
    queryFn: () => api.get<Page<ResourceItem>>("/resources/domain_request", { q: name, page_size: 50, sort: "created_at", order: "desc" }),
  });
  return (
    <Table
      variant="embedded"
      loading={isPending}
      loadingText="Loading requests"
      items={(data?.items ?? []).filter((r) => r.domain_name === name)}
      trackBy="id"
      columnDefinitions={[
        { id: "type", header: "Request", cell: (r) => String(r.request_type).replace(/_/g, " ").toLowerCase() },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "at", header: "Submitted (UTC)", cell: (r) => String(r.submitted_at).replace("T", " ") },
        { id: "detail", header: "Detail", cell: (r) => String(r.detail || "-") },
      ]}
      empty={<Box textAlign="center">No requests yet.</Box>}
    />
  );
}

const REQUEST_TYPES = ["REGISTER_DOMAIN", "RENEW_DOMAIN", "TRANSFER_OUT", "UPDATE_DOMAIN"].map((t) => ({ value: t, label: t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));

export const domainRequestConfig: ResourceConfig = {
  route: "domain-requests",
  api: "/resources/domain_request",
  title: "Requests",
  singular: "request",
  description: "Operations on your domains: registrations, renewals, transfers and updates.",
  help: {
    summary: "Every domain operation creates a request that you can follow here.",
    points: ["Requests start as In progress and complete a few seconds later (simulated).", "The list is read-only; requests cannot be edited or deleted."],
  },
  readOnly: true,
  searchPlaceholder: "Filter requests by domain or ID",
  filters: [
    { key: "status", label: "statuses", options: [{ value: "IN_PROGRESS", label: "In progress" }, { value: "SUCCESSFUL", label: "Successful" }, { value: "FAILED", label: "Failed" }] },
    { key: "request_type", label: "request types", options: REQUEST_TYPES },
  ],
  columns: [
    { id: "id", header: "Request ID", cell: (i) => String(i.id) },
    { id: "type", header: "Type", sortKey: "request_type", cell: (i) => REQUEST_TYPES.find((t) => t.value === i.request_type)?.label ?? String(i.request_type) },
    { id: "domain", header: "Domain", cell: (i) => String(i.domain_name) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "submitted", header: "Submitted (UTC)", sortKey: "created_at", cell: (i) => String(i.submitted_at).replace("T", " ") },
    { id: "price", header: "Price", cell: (i) => (i.price ? `$${Number(i.price).toFixed(2)}` : "-") },
  ],
  fields: [],
  detailRows: [
    { label: "Request ID", value: (i) => String(i.id) },
    { label: "Type", value: (i) => String(i.request_type) },
    { label: "Domain", value: (i) => String(i.domain_name) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Submitted (UTC)", value: (i) => String(i.submitted_at).replace("T", " ") },
    { label: "Detail", value: (i) => String(i.detail || "-") },
  ],
};
