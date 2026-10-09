"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import { useRef } from "react";

import { BriefTable } from "@/components/common/BriefTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RowsEditor } from "@/components/resource/RowsEditor";
import { validateHostname } from "@/lib/dns-validation";
import type { CustomFieldProps, ResourceConfig, ResourceItem } from "@/lib/resource-config";

const NAME_RULE = (v: unknown) => (/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(String(v).trim()) ? null : "Use 1-64 letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.");
const strs = (i: ResourceItem, key: string) => (i[key] as string[] | undefined) ?? [];
const objs = (i: ResourceItem, key: string) => (i[key] as Record<string, unknown>[] | undefined) ?? [];

function patternError(raw: string): string | null {
  const text = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!text) return null;
  const base = text.startsWith("*.") ? text.slice(2) : text;
  const problem = validateHostname(base, "Domain");
  if (problem) return problem;
  return !base.includes(".") && !text.startsWith("*.") ? "Enter a fully qualified domain such as bad.example.com." : null;
}

// ------------------------------------------------------------------ domain lists
function DomainsField({ value, onChange, error }: CustomFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const lines = Array.isArray(value) ? (value as string[]) : [];
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const incoming = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    onChange([...lines.filter((l) => l.trim()), ...incoming]);
  };
  const count = lines.filter((l) => l.trim()).length;
  return (
    <FormField
      label="Domains"
      description="One domain per line. Use *.example.com to match every subdomain. Lines starting with # are ignored when importing a file."
      constraintText={`${count.toLocaleString()} domain${count === 1 ? "" : "s"} (up to 10,000)`}
      errorText={error ? <span style={{ whiteSpace: "pre-line" }}>{error}</span> : undefined}
      stretch
    >
      <SpaceBetween size="s">
        <div className="mono-textarea">
          <Textarea value={lines.join("\n")} onChange={({ detail }) => onChange(detail.value.split("\n"))} rows={12} spellcheck={false} placeholder={"bad.example.com\n*.tracker.example.net"} invalid={!!error} ariaLabel="Domains" />
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button iconName="upload" formAction="none" onClick={() => fileRef.current?.click()}>Import from file</Button>
        </div>
      </SpaceBetween>
    </FormField>
  );
}

export const domainListConfig: ResourceConfig = {
  route: "dns-firewall-domain-lists",
  api: "/resources/fw_domain_list",
  title: "Domain lists",
  singular: "domain list",
  description: "Collections of domain names that DNS Firewall rules allow, block or alert on.",
  help: {
    summary: "A domain list is a set of domain names (optionally with * wildcards) used by DNS Firewall rules.",
    points: ["Paste domains or import a text file with one domain per line.", "*.example.com matches every subdomain but not example.com itself.", "A list cannot be deleted while a rule group uses it."],
  },
  searchPlaceholder: "Filter lists by name, ID or domain",
  columns: [
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "List ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "count", header: "Domains", cell: (i) => String(i.domain_count) },
    { id: "created", header: "Created", sortKey: "created_at", hidden: true, cell: (i) => new Date(String(i.created_at).endsWith("Z") ? String(i.created_at) : `${i.created_at}Z`).toLocaleDateString() },
  ],
  fields: [
    { type: "text", name: "name", label: "Domain list name", placeholder: "blocked-domains", validate: NAME_RULE },
    {
      type: "custom", name: "domains", label: "Domains", optional: true, render: (p) => <DomainsField {...p} />,
      validate: (v) => {
        const lines = (Array.isArray(v) ? (v as string[]) : []).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 10000) return "A domain list can hold at most 10,000 domains.";
        for (const [i, l] of lines.entries()) {
          const problem = patternError(l);
          if (problem) return `Line ${i + 1} ('${l}'): ${problem}`;
        }
        return null;
      },
    },
  ],
  defaults: { domains: [] },
  detailRows: [
    { label: "List ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Domains", value: (i) => String(i.domain_count) },
  ],
  detailTabs: [
    {
      id: "domains",
      label: (i) => `Domains (${i.domain_count})`,
      render: (i) => (
        <Table
          variant="embedded"
          items={strs(i, "domains").slice(0, 500).map((d) => ({ d }))}
          trackBy="d"
          columnDefinitions={[{ id: "d", header: strs(i, "domains").length > 500 ? "Domain (first 500 shown)" : "Domain", cell: (r) => <span className="record-value">{r.d}</span> }]}
          empty={<Box textAlign="center" color="text-body-secondary">This list is empty. Edit it to add domains.</Box>}
        />
      ),
    },
  ],
};

// ------------------------------------------------------------------ rule groups
const ACTIONS = [
  { value: "BLOCK", label: "Block" },
  { value: "ALLOW", label: "Allow" },
  { value: "ALERT", label: "Alert" },
];
const BLOCK_RESPONSES = [
  { value: "NODATA", label: "NODATA" },
  { value: "NXDOMAIN", label: "NXDOMAIN" },
  { value: "OVERRIDE", label: "Override (CNAME)" },
];

function RulesField({ value, onChange, error }: CustomFieldProps) {
  return (
    <RowsEditor
      label={<>Rules <i>- optional</i></>}
      description="Rules are evaluated by priority (lowest first). The first ALLOW or BLOCK match decides the query; ALERT only logs."
      error={error}
      rows={(Array.isArray(value) ? value : []) as Record<string, unknown>[]}
      columns={[
        { key: "name", label: "Rule name", type: "text", width: "2fr", placeholder: "block-malware" },
        { key: "priority", label: "Priority", type: "number", width: "1fr", placeholder: "10" },
        { key: "domain_list_id", label: "Domain list", type: "select", width: "2fr", source: "resources:fw_domain_list", placeholder: "Choose a list" },
        { key: "action", label: "Action", type: "select", width: "1.4fr", options: ACTIONS },
        { key: "block_response", label: "Block response", type: "select", width: "1.6fr", options: BLOCK_RESPONSES, visibleWhen: (r) => r.action === "BLOCK" },
        { key: "override_domain", label: "Override domain", type: "text", width: "2fr", placeholder: "sinkhole.example.net", visibleWhen: (r) => r.action === "BLOCK" && r.block_response === "OVERRIDE" },
      ]}
      blank={{ name: "", priority: "", domain_list_id: "", action: "BLOCK", block_response: "NODATA", override_domain: "", override_ttl: 60 }}
      addLabel="Add rule"
      rowNoun="rule"
      onChange={onChange}
    />
  );
}

function AssociationsField({ value, onChange, error }: CustomFieldProps) {
  return (
    <RowsEditor
      label={<>VPC associations <i>- optional</i></>}
      description="Rule groups are applied to a VPC in association-priority order (100 to 9900, lowest first)."
      error={error}
      rows={(Array.isArray(value) ? value : []) as Record<string, unknown>[]}
      columns={[
        { key: "vpc_id", label: "VPC", type: "select", width: "3fr", source: "vpcs", placeholder: "Choose a VPC" },
        { key: "priority", label: "Priority", type: "number", width: "1fr", placeholder: "200" },
      ]}
      blank={{ vpc_id: "", priority: 200 }}
      addLabel="Add VPC"
      rowNoun="VPC"
      onChange={onChange}
    />
  );
}

export const ruleGroupConfig: ResourceConfig = {
  route: "dns-firewall",
  api: "/resources/fw_rule_group",
  title: "Rule groups",
  singular: "rule group",
  description: "Filter the DNS queries made from your VPCs: allow, block or alert on domains from your domain lists.",
  help: {
    summary: "A DNS Firewall rule group holds rules; each rule applies an action to the domains of a domain list.",
    points: ["Block responses: NODATA (empty answer), NXDOMAIN (name does not exist) or OVERRIDE (a CNAME you choose).", "Rule priorities are unique within the group; association priorities are unique per VPC.", "Try it: open a hosted zone, choose Test record and pick the source VPC."],
  },
  searchPlaceholder: "Filter rule groups by name, ID or description",
  columns: [
    { id: "name", header: "Name", sortKey: "name", cell: (i) => i.name },
    { id: "id", header: "Rule group ID", cell: (i) => String(i.id) },
    { id: "status", header: "Status", sortKey: "status", cell: (i) => <StatusBadge status={i.status} /> },
    { id: "rules", header: "Rules", cell: (i) => String(i.rule_count) },
    { id: "vpcs", header: "VPCs", cell: (i) => String(i.vpc_count) },
    { id: "description", header: "Description", hidden: true, cell: (i) => String(i.description || "-") },
  ],
  fields: [
    { type: "text", name: "name", label: "Rule group name", placeholder: "baseline-firewall", validate: NAME_RULE },
    { type: "text", name: "description", label: "Description", optional: true },
    {
      type: "custom", name: "rules", label: "Rules", optional: true, render: (p) => <RulesField {...p} />,
      validate: (v) => {
        const rows = (Array.isArray(v) ? v : []) as Record<string, string | number>[];
        const priorities = new Set<number>();
        for (const [i, r] of rows.entries()) {
          if (!String(r.name).trim()) return `Rule ${i + 1}: enter a name.`;
          const p = Number(r.priority);
          if (!Number.isInteger(p) || p < 1 || p > 10000) return `Rule ${i + 1}: priority must be between 1 and 10000.`;
          if (priorities.has(p)) return `Rule ${i + 1}: priority ${p} is used by another rule.`;
          priorities.add(p);
          if (!r.domain_list_id) return `Rule ${i + 1}: choose a domain list.`;
          if (r.action === "BLOCK" && r.block_response === "OVERRIDE") {
            const problem = validateHostname(String(r.override_domain), "Override domain");
            if (problem) return `Rule ${i + 1}: ${problem}`;
          }
        }
        return null;
      },
    },
    {
      type: "custom", name: "associations", label: "VPC associations", optional: true, render: (p) => <AssociationsField {...p} />,
      validate: (v) => {
        const rows = (Array.isArray(v) ? v : []) as Record<string, string | number>[];
        const seen = new Set<string>();
        for (const [i, r] of rows.entries()) {
          if (!r.vpc_id) return `Association ${i + 1}: choose a VPC.`;
          if (seen.has(String(r.vpc_id))) return `Association ${i + 1}: ${r.vpc_id} is listed twice.`;
          seen.add(String(r.vpc_id));
          const p = Number(r.priority);
          if (!Number.isInteger(p) || p < 100 || p > 9900) return `Association ${i + 1}: priority must be between 100 and 9900.`;
        }
        return null;
      },
    },
  ],
  defaults: { rules: [], associations: [] },
  toPayload: (v) => ({
    ...v,
    rules: ((v.rules as Record<string, unknown>[]) ?? []).map((r) => ({ ...r, priority: Number(r.priority), override_ttl: Number(r.override_ttl ?? 60) })),
    associations: ((v.associations as Record<string, unknown>[]) ?? []).map((a) => ({ ...a, priority: Number(a.priority) })),
  }),
  detailRows: [
    { label: "Rule group ID", value: (i) => String(i.id) },
    { label: "Status", value: (i) => <StatusBadge status={i.status} /> },
    { label: "Description", value: (i) => String(i.description || "-") },
    { label: "Rules", value: (i) => String(i.rule_count) },
    { label: "VPCs", value: (i) => String(i.vpc_count) },
  ],
  detailTabs: [
    {
      id: "rules",
      label: (i) => `Rules (${i.rule_count})`,
      render: (i) => (
        <Table
          variant="embedded"
          items={objs(i, "rules").slice().sort((a, b) => Number(a.priority) - Number(b.priority))}
          trackBy="name"
          columnDefinitions={[
            { id: "priority", header: "Priority", cell: (r) => String(r.priority) },
            { id: "name", header: "Name", cell: (r) => String(r.name) },
            { id: "list", header: "Domain list", cell: (r) => String(r.domain_list_id) },
            { id: "action", header: "Action", cell: (r) => (r.action === "BLOCK" ? `Block (${r.block_response}${r.block_response === "OVERRIDE" ? ` → ${r.override_domain}` : ""})` : String(r.action)) },
          ]}
          empty={<Box textAlign="center" color="text-body-secondary">No rules yet.</Box>}
        />
      ),
    },
    {
      id: "vpcs",
      label: (i) => `VPC associations (${i.vpc_count})`,
      render: (i) => <BriefTable items={objs(i, "associations").map((a) => ({ id: String(a.vpc_id), name: String(a.vpc_id), extra: `Priority ${a.priority}` }))} noun="VPC associations" />,
    },
  ],
};
