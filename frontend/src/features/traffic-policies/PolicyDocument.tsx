"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";

import type { CustomFieldProps } from "@/lib/resource-config";

export const EXAMPLE_POLICY = {
  AWSPolicyFormatVersion: "2015-10-01",
  RecordType: "A",
  StartRule: "main",
  Endpoints: {
    primary: { Type: "value", Value: "192.0.2.10" },
    standby: { Type: "value", Value: "192.0.2.20" },
  },
  Rules: {
    main: { RuleType: "failover", Primary: { EndpointReference: "primary" }, Secondary: { EndpointReference: "standby" } },
  },
};

type Json = Record<string, unknown>;

export function parseDocument(text: string): { doc: Json | null; error: string | null } {
  if (!text.trim()) return { doc: null, error: null };
  try {
    const doc = JSON.parse(text);
    return doc && typeof doc === "object" && !Array.isArray(doc) ? { doc, error: null } : { doc: null, error: "Document must be a JSON object." };
  } catch (e) {
    return { doc: null, error: `Not valid JSON: ${(e as Error).message}` };
  }
}

function describeTarget(item: Json, endpoints: Json): string {
  const ref = String(item.EndpointReference ?? "?");
  const ep = (endpoints[ref] as Json | undefined) ?? {};
  const where = ep.Value ? `${ep.Value}${ep.Type && ep.Type !== "value" ? ` (${ep.Type})` : ""}` : "unknown endpoint";
  const extras = [item.Weight !== undefined ? `weight ${item.Weight}` : "", item.Region ? String(item.Region) : "", item.Continent ? String(item.Continent) : "", item.Country ? String(item.Country) : "", item.IsDefault ? "default" : ""].filter(Boolean);
  return `${ref} → ${where}${extras.length ? ` [${extras.join(", ")}]` : ""}`;
}

/** Read-only visual summary of a policy document: start point, rule and the endpoints it routes to. */
export function PolicyTree({ doc }: { doc: Json }) {
  const endpoints = (doc.Endpoints as Json) ?? {};
  const rules = (doc.Rules as Record<string, Json>) ?? {};
  const lines: { depth: number; text: string }[] = [];
  lines.push({ depth: 0, text: `DNS type ${doc.RecordType ?? "?"}` });
  if (doc.StartEndpoint) {
    lines.push({ depth: 1, text: `Start → endpoint ${describeTarget({ EndpointReference: doc.StartEndpoint }, endpoints)}` });
  } else if (typeof doc.StartRule === "string" && rules[doc.StartRule]) {
    const rule = rules[doc.StartRule];
    lines.push({ depth: 1, text: `Start → rule "${doc.StartRule}" (${rule.RuleType})` });
    const children: Json[] =
      rule.RuleType === "failover"
        ? [{ ...(rule.Primary as Json), Role: "Primary" }, { ...(rule.Secondary as Json), Role: "Secondary" }]
        : ((rule.Items ?? rule.Regions ?? rule.Locations ?? []) as Json[]);
    for (const child of children) lines.push({ depth: 2, text: `${child.Role ? `${child.Role}: ` : ""}${describeTarget(child, endpoints)}` });
  } else {
    lines.push({ depth: 1, text: "No valid start point yet" });
  }
  return (
    <div style={{ fontFamily: "Monaco, Menlo, Consolas, monospace", fontSize: 12, lineHeight: 1.8 }} aria-label="Policy preview">
      {lines.map((l, i) => (
        <div key={i} style={{ paddingLeft: l.depth * 20 }}>{l.depth > 0 ? "└ " : ""}{l.text}</div>
      ))}
    </div>
  );
}

/** JSON editor for a traffic policy document with format / example helpers and a live preview. */
export function PolicyDocumentField({ value, onChange, error }: CustomFieldProps) {
  const text = String(value ?? "");
  const { doc, error: parseError } = parseDocument(text);
  const shown = error ?? parseError ?? undefined;
  return (
    <FormField
      label="Policy document (JSON)"
      description="Describe the DNS type, the endpoints and the rule that routes between them."
      errorText={shown ? <span style={{ whiteSpace: "pre-line" }}>{shown}</span> : undefined}
      constraintText="Rule types: failover, weighted, latency, geo, multivalue. Rules cannot be nested in this console."
      stretch
    >
      <SpaceBetween size="s">
        <Textarea value={text} onChange={({ detail }) => onChange(detail.value)} rows={16} spellcheck={false} invalid={!!shown} ariaLabel="Policy document" />
        <SpaceBetween direction="horizontal" size="xs">
          <Button formAction="none" disabled={!doc} onClick={() => doc && onChange(JSON.stringify(doc, null, 2))}>Format</Button>
          <Button formAction="none" onClick={() => onChange(JSON.stringify(EXAMPLE_POLICY, null, 2))}>Insert example</Button>
        </SpaceBetween>
        {doc && (
          <div>
            <Box variant="awsui-key-label">Preview</Box>
            <PolicyTree doc={doc} />
          </div>
        )}
      </SpaceBetween>
    </FormField>
  );
}
