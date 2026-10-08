"use client";

import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { EmptyState, ErrorState } from "@/components/states/States";
import { DeleteZoneModal } from "@/features/hosted-zones/DeleteZoneModal";
import { EditZoneModal } from "@/features/hosted-zones/EditZoneModal";
import { useHostedZones } from "@/features/hosted-zones/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUrlParams } from "@/hooks/useUrlParams";
import type { HostedZone } from "@/types/api";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "public", label: "Public hosted zones" },
  { value: "private", label: "Private hosted zones" },
];

export default function HostedZonesPage() {
  const router = useRouter();
  usePageChrome([{ text: "Hosted zones", href: "/hosted-zones" }], "table");
  const { params, update, getInt } = useUrlParams();

  const q = params.get("q") ?? "";
  const type = params.get("type") ?? "";
  const sort = params.get("sort") ?? "name";
  const order = params.get("order") ?? "asc";
  const page = getInt("page", 1);
  const pageSize = getInt("page_size", 10);

  // Search-as-you-type: keep typing responsive, push to the URL (and server) after a pause.
  const [filterText, setFilterText] = useState(q);
  const debouncedText = useDebouncedValue(filterText, 300);
  useEffect(() => {
    if (debouncedText !== q) update({ q: debouncedText, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  const { data, isPending, isFetching, error, refetch } = useHostedZones({ q: q || undefined, type: type || undefined, sort, order, page, page_size: pageSize });

  const [selected, setSelected] = useState<HostedZone[]>([]);
  const [editing, setEditing] = useState<HostedZone | null>(null);
  const [deleting, setDeleting] = useState<HostedZone | null>(null);
  const current = selected[0] ? (data?.items.find((z) => z.zone_id === selected[0].zone_id) ?? selected[0]) : undefined;
  const filtered = !!(q || type);

  const columns: TableProps.ColumnDefinition<HostedZone>[] = [
    {
      id: "name",
      header: "Hosted zone name",
      sortingField: "name",
      cell: (z) => <Link href={`/hosted-zones/${z.zone_id}`} onFollow={(e) => { e.preventDefault(); router.push(`/hosted-zones/${z.zone_id}`); }}>{z.name}</Link>,
      isRowHeader: true,
    },
    { id: "type", header: "Type", sortingField: "type", cell: (z) => (z.type === "public" ? "Public" : "Private") },
    { id: "created_by", header: "Created by", cell: (z) => z.created_by },
    { id: "record_count", header: "Record count", sortingField: "record_count", cell: (z) => z.record_count },
    { id: "comment", header: "Description", sortingField: "comment", cell: (z) => z.comment || "-" },
    { id: "zone_id", header: "Hosted zone ID", cell: (z) => z.zone_id },
  ];

  return (
    <>
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Unable to load hosted zones" />
      ) : (
        <Table
          variant="full-page"
          stickyHeader
          items={data?.items ?? []}
          columnDefinitions={columns}
          loading={isPending}
          loadingText="Loading hosted zones"
          trackBy="zone_id"
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
          ariaLabels={{
            selectionGroupLabel: "Hosted zone selection",
            itemSelectionLabel: (_s, item) => `Select ${item.name}`,
            allItemsSelectionLabel: () => "Select hosted zone",
          }}
          sortingColumn={{ sortingField: sort }}
          sortingDescending={order === "desc"}
          onSortingChange={({ detail }) => update({ sort: detail.sortingColumn.sortingField, order: detail.isDescending ? "desc" : "asc", page: null })}
          header={
            <Header
              variant="awsui-h1-sticky"
              counter={data ? `(${data.total})` : undefined}
              info={<Link variant="info">Info</Link>}
              description="Hosted zones contain the DNS records that route traffic for a domain."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button disabled={!current} onClick={() => current && router.push(`/hosted-zones/${current.zone_id}`)}>View details</Button>
                  <Button disabled={!current} onClick={() => setEditing(current ?? null)}>Edit</Button>
                  <Button disabled={!current} onClick={() => setDeleting(current ?? null)}>Delete</Button>
                  <Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>Create hosted zone</Button>
                </SpaceBetween>
              }
            >
              Hosted zones
            </Header>
          }
          filter={
            <SpaceBetween direction="horizontal" size="xs">
              <div style={{ minWidth: 320 }}>
                <TextFilter
                  filteringText={filterText}
                  filteringPlaceholder="Filter hosted zones by name, description or ID"
                  filteringAriaLabel="Filter hosted zones"
                  onChange={({ detail }) => setFilterText(detail.filteringText)}
                  countText={filtered && data ? `${data.total} ${data.total === 1 ? "match" : "matches"}` : undefined}
                />
              </div>
              <div style={{ minWidth: 220 }}>
                <Select
                  selectedOption={TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0]}
                  options={TYPE_OPTIONS}
                  onChange={({ detail }) => update({ type: detail.selectedOption.value, page: null })}
                  ariaLabel="Filter by hosted zone type"
                />
              </div>
            </SpaceBetween>
          }
          pagination={
            <Pagination
              currentPageIndex={Math.min(page, data?.pages ?? 1)}
              pagesCount={data?.pages ?? 1}
              disabled={isFetching && !data}
              onChange={({ detail }) => update({ page: detail.currentPageIndex })}
              ariaLabels={{ nextPageLabel: "Next page", previousPageLabel: "Previous page", pageLabel: (n) => `Page ${n} of all pages` }}
            />
          }
          preferences={
            <CollectionPreferences
              title="Preferences"
              confirmLabel="Confirm"
              cancelLabel="Cancel"
              preferences={{ pageSize }}
              pageSizePreference={{ title: "Page size", options: [10, 20, 50].map((v) => ({ value: v, label: `${v} hosted zones` })) }}
              onConfirm={({ detail }) => update({ page_size: detail.pageSize, page: null })}
            />
          }
          empty={
            filtered ? (
              <EmptyState
                title="No matches"
                body="No hosted zones match your filter."
                actionLabel="Clear filter"
                onAction={() => {
                  setFilterText("");
                  update({ q: null, type: null, page: null });
                }}
              />
            ) : (
              <EmptyState title="No hosted zones" body="You have no hosted zones in this account." actionLabel="Create hosted zone" onAction={() => router.push("/hosted-zones/create")} />
            )
          }
        />
      )}
      <EditZoneModal zone={editing} onDismiss={() => setEditing(null)} />
      <DeleteZoneModal zone={deleting} onDismiss={() => setDeleting(null)} onDeleted={() => setSelected([])} />
    </>
  );
}
