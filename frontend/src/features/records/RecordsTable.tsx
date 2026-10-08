"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDeleteModal } from "@/components/common/ConfirmDeleteModal";
import { useFlash } from "@/components/layout/FlashProvider";
import { EmptyState, ErrorState } from "@/components/states/States";
import { useDeleteRecords, useRecords } from "@/features/records/hooks";
import { ApiError, exportUrl } from "@/lib/api";
import { differentiator, displayValues, RECORD_TYPES, ROUTING_LABEL, ROUTING_POLICIES } from "@/lib/record-config";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUrlParams } from "@/hooks/useUrlParams";
import type { DnsRecord, HostedZone } from "@/types/api";

const ANY = { value: "", label: "" };
const TYPE_OPTIONS = [{ ...ANY, label: "All types" }, ...[...RECORD_TYPES, { type: "SOA" as const }].map((t) => ({ value: t.type, label: t.type }))];
const POLICY_OPTIONS = [{ ...ANY, label: "All routing policies" }, ...ROUTING_POLICIES.map((p) => ({ value: p.value, label: p.label }))];
const ALIAS_OPTIONS = [
  { value: "", label: "Alias: any" },
  { value: "true", label: "Alias records" },
  { value: "false", label: "Standard records" },
];

const trimDot = (name: string) => name.replace(/\.$/, "");

export function RecordsTable({ zone }: { zone: HostedZone }) {
  const router = useRouter();
  const flash = useFlash();
  const { params, update, getInt } = useUrlParams();
  const q = params.get("q") ?? "";
  const type = params.get("type") ?? "";
  const policy = params.get("policy") ?? "";
  const alias = params.get("alias") ?? "";
  const sort = params.get("sort") ?? "name";
  const order = params.get("order") ?? "asc";
  const page = getInt("page", 1);
  const pageSize = getInt("page_size", 10);

  const [filterText, setFilterText] = useState(q);
  const debounced = useDebouncedValue(filterText, 300);
  useEffect(() => {
    if (debounced !== q) update({ q: debounced, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, isPending, error, refetch } = useRecords(zone.zone_id, {
    q: q || undefined,
    type: type || undefined,
    routing_policy: policy || undefined,
    alias: alias || undefined,
    sort,
    order,
    page,
    page_size: pageSize,
  });
  const remove = useDeleteRecords(zone.zone_id);

  const [selected, setSelected] = useState<DnsRecord[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [visible, setVisible] = useState<string[]>(["name", "type", "routing", "differentiator", "alias", "value", "ttl"]);
  const filtered = !!(q || type || policy || alias);
  const editable = selected.length === 1 ? selected[0] : undefined;

  const editHref = (r: DnsRecord) => `/hosted-zones/${zone.zone_id}/records/${r.id}/edit`;

  const columns: (TableProps.ColumnDefinition<DnsRecord> & { id: string })[] = [
    {
      id: "name",
      header: "Record name",
      sortingField: "name",
      isRowHeader: true,
      cell: (r) => (
        <Link href={editHref(r)} onFollow={(e) => { e.preventDefault(); router.push(editHref(r)); }}>
          {trimDot(r.name)}
        </Link>
      ),
    },
    { id: "type", header: "Type", sortingField: "type", cell: (r) => r.type },
    { id: "routing", header: "Routing policy", sortingField: "routing_policy", cell: (r) => ROUTING_LABEL[r.routing_policy] },
    { id: "differentiator", header: "Differentiator", cell: (r) => differentiator(r) },
    { id: "alias", header: "Alias", cell: (r) => (r.alias ? "Yes" : "No") },
    {
      id: "value",
      header: "Value/Route traffic to",
      cell: (r) =>
        r.alias ? (
          <span className="record-value">{trimDot(r.alias.target)} <Box variant="small" display="inline" color="text-body-secondary">({r.alias.target_type})</Box></span>
        ) : (
          <>{displayValues(r).map((v) => <span key={v} className="record-value">{v}</span>)}</>
        ),
    },
    { id: "ttl", header: "TTL (seconds)", sortingField: "ttl", cell: (r) => r.ttl ?? "-" },
    { id: "health", header: "Health check ID", cell: (r) => r.health_check_id ?? "-" },
    { id: "evaluate", header: "Evaluate target health", cell: (r) => (r.alias ? (r.alias.evaluate_target_health ? <StatusIndicator type="success">Yes</StatusIndicator> : "No") : "-") },
    { id: "record_id", header: "Record ID", cell: (r) => r.set_identifier || "-" },
  ];

  const clearFilters = () => {
    setFilterText("");
    update({ q: null, type: null, policy: null, alias: null, page: null });
  };

  const confirmDelete = () =>
    remove.mutate(selected.map((r) => r.id), {
      onSuccess: (result) => {
        setConfirming(false);
        setSelected([]);
        flash("success", `${result.deleted} record${result.deleted === 1 ? "" : "s"} deleted successfully.`);
        if (result.skipped.length) flash("warning", `${result.skipped.length} record(s) were skipped: ${result.skipped[0].reason}`);
      },
      onError: () => flash("error", "Unable to delete the selected records."),
    });

  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} title="Unable to load records" />;

  return (
    <>
      <Table
        items={data?.items ?? []}
        columnDefinitions={columns}
        columnDisplay={columns.map((c) => ({ id: c.id, visible: visible.includes(c.id) }))}
        loading={isPending}
        loadingText="Loading records"
        trackBy="id"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        isItemDisabled={(r) => r.is_system}
        ariaLabels={{
          selectionGroupLabel: "Record selection",
          allItemsSelectionLabel: () => "Select all records on this page",
          itemSelectionLabel: (_s, item) => `Select ${trimDot(item.name)} ${item.type}${item.is_system ? " (default record, cannot be selected)" : ""}`,
        }}
        sortingColumn={{ sortingField: sort }}
        sortingDescending={order === "desc"}
        onSortingChange={({ detail }) => update({ sort: detail.sortingColumn.sortingField, order: detail.isDescending ? "desc" : "asc", page: null })}
        variant="embedded"
        header={
          <Header
            variant="h2"
            counter={data ? `(${data.total})` : undefined}
            description="Records tell Route 53 how to respond to DNS queries for the domain."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={!editable} onClick={() => editable && router.push(editHref(editable))}>Edit record</Button>
                <Button disabled={selected.length === 0} onClick={() => setConfirming(true)}>Delete record{selected.length > 1 ? "s" : ""}</Button>
                <Button onClick={() => router.push(`/hosted-zones/${zone.zone_id}/import`)}>Import zone file</Button>
                <ButtonDropdown
                  items={[
                    { id: "json", text: "Export as JSON" },
                    { id: "bind", text: "Export as BIND zone file" },
                  ]}
                  onItemClick={({ detail }) => window.location.assign(exportUrl(zone.zone_id, detail.id as "json" | "bind"))}
                >
                  Export
                </ButtonDropdown>
                <Button variant="primary" onClick={() => router.push(`/hosted-zones/${zone.zone_id}/records/create`)}>Create record</Button>
              </SpaceBetween>
            }
          >
            Records
          </Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <div style={{ minWidth: 260 }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder="Filter records by name, type or value"
                filteringAriaLabel="Filter records"
                onChange={({ detail }) => setFilterText(detail.filteringText)}
                countText={filtered && data ? `${data.total} ${data.total === 1 ? "match" : "matches"}` : undefined}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <Select selectedOption={TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0]} options={TYPE_OPTIONS} onChange={({ detail }) => update({ type: detail.selectedOption.value, page: null })} ariaLabel="Filter by record type" />
            </div>
            <div style={{ minWidth: 200 }}>
              <Select selectedOption={POLICY_OPTIONS.find((o) => o.value === policy) ?? POLICY_OPTIONS[0]} options={POLICY_OPTIONS} onChange={({ detail }) => update({ policy: detail.selectedOption.value, page: null })} ariaLabel="Filter by routing policy" />
            </div>
            <div style={{ minWidth: 160 }}>
              <Select selectedOption={ALIAS_OPTIONS.find((o) => o.value === alias) ?? ALIAS_OPTIONS[0]} options={ALIAS_OPTIONS} onChange={({ detail }) => update({ alias: detail.selectedOption.value, page: null })} ariaLabel="Filter by alias" />
            </div>
          </SpaceBetween>
        }
        pagination={
          <Pagination
            currentPageIndex={Math.min(page, data?.pages ?? 1)}
            pagesCount={data?.pages ?? 1}
            onChange={({ detail }) => update({ page: detail.currentPageIndex })}
            ariaLabels={{ nextPageLabel: "Next page", previousPageLabel: "Previous page", pageLabel: (n) => `Page ${n}` }}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{ pageSize, contentDisplay: columns.map((c) => ({ id: c.id, visible: visible.includes(c.id) })) }}
            pageSizePreference={{ title: "Page size", options: [10, 20, 50, 100].map((v) => ({ value: v, label: `${v} records` })) }}
            contentDisplayPreference={{ title: "Columns", options: columns.map((c) => ({ id: c.id, label: String(c.header) })) }}
            onConfirm={({ detail }) => {
              if (detail.contentDisplay) setVisible(detail.contentDisplay.filter((c) => c.visible).map((c) => c.id));
              update({ page_size: detail.pageSize, page: null });
            }}
          />
        }
        empty={
          filtered ? (
            <EmptyState title="No records found" body="No records match your filters." actionLabel="Clear filters" onAction={clearFilters} />
          ) : (
            <EmptyState title="No records found" body="This hosted zone has no records yet." actionLabel="Create record" onAction={() => router.push(`/hosted-zones/${zone.zone_id}/records/create`)} />
          )
        }
      />
      <ConfirmDeleteModal
        visible={confirming}
        title={selected.length === 1 ? "Delete record?" : `Delete ${selected.length} records?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.detail : null}
        onDismiss={() => { setConfirming(false); remove.reset(); }}
        onConfirm={confirmDelete}
      >
        <SpaceBetween size="xs">
          <Box>The following {selected.length === 1 ? "record" : "records"} will be permanently deleted. Traffic that depends on {selected.length === 1 ? "it" : "them"} will stop resolving.</Box>
          <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 180, overflow: "auto" }}>
            {selected.map((r) => (
              <li key={r.id}>
                <Box variant="code" display="inline">{trimDot(r.name)}</Box> ({r.type}{r.set_identifier ? `, ${r.set_identifier}` : ""})
              </li>
            ))}
          </ul>
        </SpaceBetween>
      </ConfirmDeleteModal>
    </>
  );
}
