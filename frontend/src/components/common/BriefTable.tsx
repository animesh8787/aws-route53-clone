"use client";

import Box from "@cloudscape-design/components/box";
import Table from "@cloudscape-design/components/table";
import NextLink from "next/link";

import { StatusBadge } from "@/components/common/StatusBadge";

export interface Brief {
  id: string;
  name: string;
  status?: string | null;
  extra?: string;
}

/** Small linked table of related objects shown inside detail tabs. */
export function BriefTable({ items, hrefBase, noun, empty }: { items: Brief[]; hrefBase?: string; noun: string; empty?: string }) {
  return (
    <Table
      variant="embedded"
      items={items}
      trackBy="id"
      columnDefinitions={[
        { id: "name", header: "Name", cell: (b) => (hrefBase ? <NextLink href={`${hrefBase}/${b.id}`}>{b.name}</NextLink> : b.name) },
        { id: "id", header: "ID", cell: (b) => b.id },
        ...(items.some((b) => b.status) ? [{ id: "status", header: "Status", cell: (b: Brief) => <StatusBadge status={b.status} /> }] : []),
        ...(items.some((b) => b.extra) ? [{ id: "extra", header: "Detail", cell: (b: Brief) => b.extra ?? "" }] : []),
      ]}
      empty={<Box textAlign="center" color="text-body-secondary">{empty ?? `No ${noun}.`}</Box>}
    />
  );
}
