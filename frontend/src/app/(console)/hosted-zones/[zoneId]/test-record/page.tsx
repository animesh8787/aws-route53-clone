"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import { use, useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { ErrorState } from "@/components/states/States";
import { useResolve } from "@/features/dns/hooks";
import { useHostedZone } from "@/features/hosted-zones/hooks";
import { ApiError } from "@/lib/api";
import { AWS_REGIONS, COUNTRIES, RECORD_TYPES } from "@/lib/record-config";
import type { ResolveResponse } from "@/types/api";

const NONE = { value: "", label: "Not specified" };

export default function TestRecordPage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = use(params);
  const zone = useHostedZone(zoneId);
  const resolve = useResolve();
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone.data?.name ?? zoneId, href: `/hosted-zones/${zoneId}` },
      { text: "Test record", href: `/hosted-zones/${zoneId}/test-record` },
    ],
    "form",
  );

  const [sub, setSub] = useState("");
  const [type, setType] = useState("A");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [sample, setSample] = useState<Record<string, number> | null>(null);

  if (zone.error) return <ErrorState error={zone.error} onRetry={() => zone.refetch()} title="Unable to load hosted zone" />;
  if (!zone.data) return <Spinner size="large" />;

  const fqdn = sub.trim() ? `${sub.trim().replace(/\.$/, "")}.${zone.data.name}` : zone.data.name;
  const query = () => ({
    name: fqdn,
    type,
    client_region: region || undefined,
    client_country: country || undefined,
    view: zone.data.type,
  });

  const run = () => {
    setSample(null);
    resolve.mutate(query(), { onSuccess: setResult });
  };

  /** Fire 20 seeded queries to show how weighted/multivalue routing distributes answers. */
  const runSample = async () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 20; seed++) {
      const res = await resolve.mutateAsync({ ...query(), seed });
      const key = res.answers.map((a) => a.value).join(", ") || res.rcode;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    setSample(counts);
  };

  const apiError = resolve.error instanceof ApiError ? resolve.error.detail : null;

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description={`Simulate how Route 53 answers a DNS query using the records stored for ${zone.data.name}.`}>
        Test record
      </Header>
      {apiError && <Alert type="error">{apiError}</Alert>}
      <Container header={<Header variant="h2">Query</Header>}>
        <SpaceBetween size="l">
          <ColumnLayout columns={2}>
            <FormField label="Record name" description="Leave blank to query the apex.">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Input value={sub} onChange={({ detail }) => setSub(detail.value)} placeholder="www" ariaLabel="Record name" onKeyDown={({ detail }) => detail.key === "Enter" && run()} />
                </div>
                <span>.{zone.data.name}</span>
              </div>
            </FormField>
            <FormField label="Record type">
              <Select selectedOption={{ value: type, label: type }} options={RECORD_TYPES.map((t) => ({ value: t.type, label: t.type }))} onChange={({ detail }) => setType(detail.selectedOption.value ?? "A")} ariaLabel="Record type" />
            </FormField>
            <FormField label="Resolver location (AWS Region)" description="Used by latency routing.">
              <Select selectedOption={region ? { value: region, label: region } : NONE} options={[NONE, ...AWS_REGIONS.map((r) => ({ value: r, label: r }))]} onChange={({ detail }) => setRegion(detail.selectedOption.value ?? "")} ariaLabel="Client region" />
            </FormField>
            <FormField label="Client country" description="Used by geolocation routing.">
              <Select selectedOption={country ? { value: country, label: COUNTRIES[country] ?? country } : NONE} options={[NONE, ...Object.entries(COUNTRIES).map(([v, l]) => ({ value: v, label: l }))]} onChange={({ detail }) => setCountry(detail.selectedOption.value ?? "")} filteringType="auto" ariaLabel="Client country" />
            </FormField>
          </ColumnLayout>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" onClick={run} loading={resolve.isPending && !sample}>Get response</Button>
            <Button onClick={() => void runSample()} disabled={resolve.isPending}>Sample 20 queries</Button>
          </SpaceBetween>
        </SpaceBetween>
      </Container>

      {result && (
        <Container header={<Header variant="h2" description={`${result.name} ${result.type}`}>Response</Header>}>
          <SpaceBetween size="l">
            <ColumnLayout columns={3} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">Response code</Box>
                <StatusIndicator type={result.rcode === "NOERROR" ? "success" : "warning"}>{result.rcode}</StatusIndicator>
              </div>
              <div>
                <Box variant="awsui-key-label">Routing policy applied</Box>
                <div>{result.routing_policy ?? "-"}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Hosted zone</Box>
                <div>{result.hosted_zone_id ?? "-"}</div>
              </div>
            </ColumnLayout>
            <Table
              variant="embedded"
              items={result.answers}
              trackBy={(a) => `${a.type}-${a.value}`}
              columnDefinitions={[
                { id: "name", header: "Name", cell: (a) => a.name.replace(/\.$/, "") },
                { id: "type", header: "Type", cell: (a) => a.type },
                { id: "ttl", header: "TTL", cell: (a) => a.ttl },
                { id: "value", header: "Value", cell: (a) => <span className="record-value">{a.value}</span> },
              ]}
              empty={<Box textAlign="center" color="text-body-secondary">No answers were returned.</Box>}
            />
            <div>
              <Box variant="h3">How this was answered</Box>
              <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {result.trace.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>
          </SpaceBetween>
        </Container>
      )}

      {sample && (
        <Container header={<Header variant="h2" description="20 queries with different random seeds">Answer distribution</Header>}>
          <Table
            variant="embedded"
            items={Object.entries(sample).map(([answer, count]) => ({ answer, count }))}
            trackBy="answer"
            columnDefinitions={[
              { id: "answer", header: "Answer", cell: (r) => <span className="record-value">{r.answer}</span> },
              { id: "count", header: "Times returned", cell: (r) => `${r.count} of 20 (${r.count * 5}%)` },
            ]}
          />
        </Container>
      )}
    </SpaceBetween>
  );
}
