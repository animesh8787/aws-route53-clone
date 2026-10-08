"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs from "@cloudscape-design/components/tabs";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { ErrorState } from "@/components/states/States";
import { DeleteZoneModal } from "@/features/hosted-zones/DeleteZoneModal";
import { EditZoneModal } from "@/features/hosted-zones/EditZoneModal";
import { useHostedZone } from "@/features/hosted-zones/hooks";
import { RecordsTable } from "@/features/records/RecordsTable";
import { useUrlParams } from "@/hooks/useUrlParams";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );
}

const formatDate = (iso: string) => new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function HostedZoneDetailPage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = use(params);
  const router = useRouter();
  const { params: query, update } = useUrlParams();
  const { data: zone, error, refetch } = useHostedZone(zoneId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  usePageChrome(
    [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: zone?.name ?? zoneId, href: `/hosted-zones/${zoneId}` },
    ],
    "table",
  );

  if (error) return <ErrorState error={error} onRetry={() => refetch()} title="Unable to load hosted zone" />;
  if (!zone) return <Spinner size="large" />;

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        info={<Link variant="info">Info</Link>}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setDeleting(true)}>Delete zone</Button>
            <Button onClick={() => router.push(`/hosted-zones/${zone.zone_id}/test-record`)}>Test record</Button>
            <Button onClick={() => setEditing(true)}>Edit hosted zone</Button>
          </SpaceBetween>
        }
      >
        {zone.name}
      </Header>

      <ExpandableSection variant="container" defaultExpanded headerText="Hosted zone details">
        <ColumnLayout columns={3} variant="text-grid">
          <SpaceBetween size="l">
            <Detail label="Hosted zone name">{zone.name}</Detail>
            <Detail label="Hosted zone ID">
              <CopyToClipboard variant="inline" textToCopy={zone.zone_id} copyButtonText={zone.zone_id} copyButtonAriaLabel="Copy hosted zone ID" copySuccessText="Hosted zone ID copied" copyErrorText="Unable to copy" />
            </Detail>
            <Detail label="Description">{zone.comment || "-"}</Detail>
          </SpaceBetween>
          <SpaceBetween size="l">
            <Detail label="Type">{zone.type === "public" ? "Public hosted zone" : "Private hosted zone"}</Detail>
            <Detail label="Record count">{zone.record_count}</Detail>
            <Detail label="Created by">{zone.created_by}</Detail>
            <Detail label="Created on">{formatDate(zone.created_at)}</Detail>
          </SpaceBetween>
          <SpaceBetween size="l">
            {zone.type === "public" ? (
              <Detail label="Name servers">
                <SpaceBetween size="xxs">
                  {zone.name_servers.map((ns) => <span key={ns} className="record-value">{ns}</span>)}
                </SpaceBetween>
              </Detail>
            ) : (
              <Detail label="Associated VPCs">
                {zone.vpcs.length ? zone.vpcs.map((v) => <div key={v.vpc_id}>{v.vpc_id} ({v.region})</div>) : "-"}
              </Detail>
            )}
          </SpaceBetween>
        </ColumnLayout>
      </ExpandableSection>

      <Container disableContentPaddings>
        <Tabs
          activeTabId={query.get("tab") ?? "records"}
          onChange={({ detail }) => update({ tab: detail.activeTabId === "records" ? null : detail.activeTabId })}
          tabs={[
            { id: "records", label: `Records (${zone.record_count})`, content: <RecordsTable zone={zone} /> },
            {
              id: "dnssec",
              label: "DNSSEC signing",
              content: (
                <Box padding="l" color="text-body-secondary">
                  DNSSEC signing is not available in this clone. It would be configured here in the AWS console.
                </Box>
              ),
            },
            { id: "tags", label: "Hosted zone tags", content: <Box padding="l" color="text-body-secondary">No tags are associated with this hosted zone.</Box> },
          ]}
        />
      </Container>

      <EditZoneModal zone={editing ? zone : null} onDismiss={() => setEditing(false)} />
      <DeleteZoneModal zone={deleting ? zone : null} onDismiss={() => setDeleting(false)} onDeleted={() => router.push("/hosted-zones")} />
    </SpaceBetween>
  );
}
