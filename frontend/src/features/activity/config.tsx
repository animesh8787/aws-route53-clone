"use client";

import { timeAgo } from "@/features/activity/hooks";
import type { ResourceConfig } from "@/lib/resource-config";

const when = (iso: unknown) => new Date(String(iso).endsWith("Z") ? String(iso) : `${iso}Z`).toLocaleString();
const title = (s: unknown) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export const activityConfig: ResourceConfig = {
  route: "activity",
  api: "/activity",
  title: "Activity",
  singular: "event",
  description: "Everything that changed in your account: hosted zones, records, imports, domains, policies and more.",
  help: {
    summary: "The activity list records each change made in this console. The same events appear in the notifications bell.",
    points: ["Choose an event to jump to the resource it affected.", "Filter by action to focus on creations, updates, deletions or imports."],
  },
  readOnly: true,
  searchPlaceholder: "Filter activity by resource or type",
  filters: [
    {
      key: "action",
      label: "actions",
      options: ["created", "updated", "deleted", "imported"].map((a) => ({ value: a, label: title(a) })),
    },
  ],
  rowHref: (i) => (i.href ? String(i.href) : "/dashboard"),
  columns: [
    { id: "name", header: "Resource", cell: (i) => i.name },
    { id: "type", header: "Type", cell: (i) => String(i.resource_type) },
    { id: "action", header: "Action", cell: (i) => title(i.action) },
    { id: "detail", header: "Detail", cell: (i) => String(i.detail || "-") },
    { id: "when", header: "When", cell: (i) => `${timeAgo(String(i.created_at))} (${when(i.created_at)})` },
  ],
  fields: [],
  detailRows: [],
};
