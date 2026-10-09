"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";

import { StatusBadge } from "@/components/common/StatusBadge";
import { validateCidr } from "@/lib/dns-validation";
import type { CustomFieldProps, ResourceConfig } from "@/lib/resource-config";

interface Location {
  name: string;
  cidr_blocks: string[];
}

const LOCATION_RE = /^[A-Za-z0-9_-]{1,16}$/;
const locationsOf = (value: unknown): Location[] => (Array.isArray(value) ? (value as Location[]) : []);

function LocationsField({ value, onChange, error }: CustomFieldProps) {
  const rows = locationsOf(value);
  const set = (index: number, patch: Partial<Location>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <FormField
      label={<>Locations <i>- optional</i></>}
      description="Each location is a named set of CIDR blocks. Use the location name in IP-based routing records."
      errorText={error ? <span style={{ whiteSpace: "pre-line" }}>{error}</span> : undefined}
      stretch
    >
      <SpaceBetween size="m">
        {rows.map((row, index) => (
          <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 3fr) auto", gap: 12, alignItems: "start" }}>
            <FormField label={index === 0 ? "Location name" : undefined}>
              <Input value={row.name} onChange={({ detail }) => set(index, { name: detail.value })} placeholder="london" ariaLabel={`Location name ${index + 1}`} />
            </FormField>
            <FormField label={index === 0 ? "CIDR blocks (one per line)" : undefined}>
              <Textarea
                value={row.cidr_blocks.join("\n")}
                onChange={({ detail }) => set(index, { cidr_blocks: detail.value.split("\n") })}
                placeholder={"203.0.113.0/24\n2001:db8::/32"}
                rows={3}
                spellcheck={false}
                ariaLabel={`CIDR blocks ${index + 1}`}
              />
            </FormField>
            <div style={{ paddingTop: index === 0 ? 28 : 0 }}>
              <Button variant="icon" formAction="none" iconName="close" ariaLabel={`Remove location ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))} />
            </div>
          </div>
        ))}
        <div>
          <Button iconName="add-plus" formAction="none" onClick={() => onChange([...rows, { name: "", cidr_blocks: [] }])}>Add location</Button>
        </div>
      </SpaceBetween>
    </FormField>
  );
}

export const cidrCollectionConfig: ResourceConfig = {
  route: "cidr-collections",
  api: "/resources/cidr_collection",
  title: "CIDR collections",
  singular: "CIDR collection",
  description: "Group IP address ranges into named locations and use them for IP-based routing.",
  help: {
    summary: "A CIDR collection maps names (locations) to IP address ranges so records can answer differently depending on the client's IP address.",
    points: [
      "Use IPv4 (192.0.2.0/24) or IPv6 (2001:db8::/32) network addresses; host bits must be zero.",
      "Ranges in one collection cannot overlap.",
      "Use a location name in a record with the IP-based routing policy; * is the default for unmatched clients.",
      "A collection cannot be deleted while records use it.",
      "Try it in a hosted zone with Test record and a client IP address.",
    ],
  },
  searchPlaceholder: "Filter collections by name, ID or CIDR block",
  columns: [
    { id: "name", header: "Collection name", sortKey: "name", cell: (i) => i.name },
    { id: "arn", header: "ARN", cell: (i) => String(i.arn ?? "-") },
    { id: "id", header: "Collection ID", hidden: true, cell: (i) => String(i.id) },
    { id: "status", header: "Status", hidden: true, cell: (i) => <StatusBadge status={i.status} /> },
    { id: "locations", header: "Locations", hidden: true, cell: (i) => String(i.location_count) },
    { id: "cidrs", header: "CIDR blocks", hidden: true, cell: (i) => String(i.cidr_count) },
    { id: "records", header: "Used by records", hidden: true, cell: (i) => String(i.record_count) },
  ],
  fields: [
    {
      type: "text", name: "name", label: "Collection name", placeholder: "office-networks", description: "A name that identifies the collection.",
      validate: (v) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit."),
    },
    {
      type: "custom", name: "locations", label: "Locations", optional: true, render: (p) => <LocationsField {...p} />,
      validate: (v) => {
        const rows = locationsOf(v);
        const names = new Set<string>();
        for (const [i, row] of rows.entries()) {
          const name = row.name.trim();
          if (!LOCATION_RE.test(name) || name === "*") return `Location ${i + 1}: use 1-16 letters, digits, underscores or hyphens.`;
          if (names.has(name.toLowerCase())) return `Location ${i + 1}: duplicate name '${name}'.`;
          names.add(name.toLowerCase());
          const blocks = row.cidr_blocks.map((b) => b.trim()).filter(Boolean);
          if (blocks.length === 0) return `Location '${name}' needs at least one CIDR block.`;
          for (const b of blocks) {
            const problem = validateCidr(b);
            if (problem) return `Location '${name}': ${problem}`;
          }
        }
        return null;
      },
    },
  ],
  defaults: { locations: [] },
  toPayload: (v) => ({
    ...v,
    locations: locationsOf(v.locations).map((l) => ({ name: l.name.trim(), cidr_blocks: l.cidr_blocks.map((b) => b.trim()).filter(Boolean) })),
  }),
  detailRows: [
    { label: "Collection ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Locations", value: (i) => String(i.location_count) },
    { label: "CIDR blocks", value: (i) => String(i.cidr_count) },
    { label: "Used by records", value: (i) => String(i.record_count) },
  ],
  detailTabs: [
    {
      id: "locations",
      label: (i) => `Locations (${i.location_count})`,
      render: (i) => (
        <Table
          variant="embedded"
          items={locationsOf(i.locations)}
          trackBy="name"
          columnDefinitions={[
            { id: "name", header: "Location name", cell: (l) => l.name },
            { id: "count", header: "Blocks", cell: (l) => l.cidr_blocks.length },
            { id: "cidrs", header: "CIDR blocks", cell: (l) => l.cidr_blocks.map((b) => <span key={b} className="record-value">{b}</span>) },
          ]}
          empty={<Box textAlign="center" color="text-body-secondary">No locations yet. Edit the collection to add some.</Box>}
        />
      ),
    },
  ],
  deleteWarning: (i) => (Number(i.record_count) > 0 ? `${i.record_count} record(s) use this collection. Deletion is blocked until they are removed.` : null),
};
