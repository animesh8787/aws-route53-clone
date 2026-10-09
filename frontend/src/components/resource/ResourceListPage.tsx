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

import { DeleteResourceModal } from "@/components/resource/DeleteResourceModal";
import { usePageChrome } from "@/components/layout/ChromeContext";
import { useHelp } from "@/components/layout/HelpContext";
import { EmptyState, ErrorState } from "@/components/states/States";
import { useResourceList } from "@/features/resources/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUrlParams } from "@/hooks/useUrlParams";
import { idOf, type ResourceConfig, type ResourceItem } from "@/lib/resource-config";

/** Console-style collection page: filter, sort, paginate, select, create / view / edit / delete. */
export function ResourceListPage({ config }: { config: ResourceConfig }) {
  const router = useRouter();
  const { params, update, getInt } = useUrlParams();
  usePageChrome([{ text: config.title, href: `/${config.route}` }], "table");
  const help = useHelp();

  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "name";
  const order = params.get("order") ?? "asc";
  const page = getInt("page", 1);
  const pageSize = getInt("page_size", 10);
  const filterValues = Object.fromEntries((config.filters ?? []).map((f) => [f.key, params.get(f.key) ?? ""]));
  const activeFilters = Object.fromEntries(Object.entries(filterValues).filter(([, v]) => v));

  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text, 300);
  useEffect(() => {
    if (debounced !== q) update({ q: debounced, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = useResourceList(config, { q: q || undefined, sort, order, page, page_size: pageSize, filters: activeFilters });
  const { data, isPending, isFetching, error, refetch } = list;
  const [selected, setSelected] = useState<ResourceItem[]>([]);
  const [deleting, setDeleting] = useState<ResourceItem | null>(null);
  const [visible, setVisible] = useState(() => config.columns.filter((c) => !c.hidden).map((c) => c.id));
  const current = selected[0] ? (data?.items.find((i) => idOf(config, i) === idOf(config, selected[0])) ?? selected[0]) : undefined;
  const filtered = !!(q || Object.keys(activeFilters).length);
  const detailHref = (item: ResourceItem) => config.rowHref?.(item) ?? `/${config.route}/${idOf(config, item)}`;
  const createHref = config.createHref ?? `/${config.route}/create`;

  const columns: TableProps.ColumnDefinition<ResourceItem>[] = config.columns.map((c, index) => ({
    id: c.id,
    header: c.header,
    sortingField: c.sortKey,
    isRowHeader: index === 0,
    cell:
      index === 0
        ? (item) => (
            <Link href={detailHref(item)} onFollow={(e) => { e.preventDefault(); router.push(detailHref(item)); }}>
              {c.cell(item)}
            </Link>
          )
        : c.cell,
  }));

  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} title={`Unable to load ${config.title.toLowerCase()}`} />;

  const clear = () => {
    setText("");
    update({ q: null, page: null, ...Object.fromEntries((config.filters ?? []).map((f) => [f.key, null])) });
  };

  const table = (
      <Table
        variant={config.intro ? "container" : "full-page"}
        stickyHeader={!config.intro}
        items={data?.items ?? []}
        columnDefinitions={columns}
        columnDisplay={config.columns.map((c) => ({ id: c.id, visible: visible.includes(c.id) }))}
        loading={isPending}
        loadingText={`Loading ${config.title.toLowerCase()}`}
        trackBy={(item) => idOf(config, item)}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={{
          selectionGroupLabel: `${config.title} selection`,
          itemSelectionLabel: (_s, item) => `Select ${item.name}`,
          allItemsSelectionLabel: () => `Select ${config.singular}`,
        }}
        sortingColumn={{ sortingField: sort }}
        sortingDescending={order === "desc"}
        onSortingChange={({ detail }) => update({ sort: detail.sortingColumn.sortingField, order: detail.isDescending ? "desc" : "asc", page: null })}
        header={
          <Header
            variant={config.intro ? "h2" : "awsui-h1-sticky"}
            counter={data ? `(${data.total})` : undefined}
            info={<Link variant="info" onFollow={() => help.open(config.helpTopic ?? config.route)}>Info</Link>}
            description={config.description}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel={`Refresh ${config.title.toLowerCase()}`} loading={isFetching && !isPending} onClick={() => void refetch()} />
                <Button disabled={!current} onClick={() => current && router.push(detailHref(current))}>View details</Button>
                {!config.readOnly && <Button disabled={!current} onClick={() => current && router.push(`${detailHref(current)}/edit`)}>Edit</Button>}
                {!config.readOnly && !config.noDelete && <Button disabled={!current} onClick={() => setDeleting(current ?? null)}>Delete</Button>}
                {config.headerActions?.({ selected: current, refresh: () => void refetch() })}
                {!config.readOnly && <Button variant="primary" onClick={() => router.push(createHref)}>{config.createLabel ?? `Create ${config.singular}`}</Button>}
              </SpaceBetween>
            }
          >
            {config.title}
          </Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <div style={{ minWidth: 300, width: "min(728px, 60vw)" }}>
              <TextFilter
                filteringText={text}
                filteringPlaceholder={config.searchPlaceholder}
                filteringAriaLabel={`Filter ${config.title.toLowerCase()}`}
                onChange={({ detail }) => setText(detail.filteringText)}
                countText={filtered && data ? `${data.total} ${data.total === 1 ? "match" : "matches"}` : undefined}
              />
            </div>
            {(config.filters ?? []).map((f) => {
              const options = [{ value: "", label: `All ${f.label.toLowerCase()}` }, ...f.options];
              return (
                <div key={f.key} style={{ minWidth: 190 }}>
                  <Select
                    selectedOption={options.find((o) => o.value === filterValues[f.key]) ?? options[0]}
                    options={options}
                    onChange={({ detail }) => update({ [f.key]: detail.selectedOption.value, page: null })}
                    ariaLabel={`Filter by ${f.label.toLowerCase()}`}
                  />
                </div>
              );
            })}
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
            preferences={{ pageSize, contentDisplay: config.columns.map((c) => ({ id: c.id, visible: visible.includes(c.id) })) }}
            pageSizePreference={{ title: "Page size", options: [10, 20, 50].map((v) => ({ value: v, label: `${v} ${config.title.toLowerCase()}` })) }}
            contentDisplayPreference={{ title: "Columns", options: config.columns.map((c) => ({ id: c.id, label: c.header })) }}
            onConfirm={({ detail }) => {
              if (detail.contentDisplay) setVisible(detail.contentDisplay.filter((c) => c.visible).map((c) => c.id));
              update({ page_size: detail.pageSize, page: null });
            }}
          />
        }
        empty={
          filtered ? (
            <EmptyState title="No matches" body={`No ${config.title.toLowerCase()} match your filter.`} actionLabel="Clear filter" onAction={clear} />
          ) : (
            <EmptyState
              title={`No ${config.title.toLowerCase()}`}
              body={`You have no ${config.title.toLowerCase()} yet.`}
              actionLabel={config.readOnly ? undefined : (config.createLabel ?? `Create ${config.singular}`)}
              onAction={() => router.push(createHref)}
            />
          )
        }
      />
  );

  return (
    <>
      {config.intro ? (
        <SpaceBetween size="l">
          {config.intro}
          {table}
        </SpaceBetween>
      ) : (
        table
      )}
      <DeleteResourceModal config={config} item={deleting} onDismiss={() => setDeleting(null)} onDeleted={() => setSelected([])} />
    </>
  );
}
