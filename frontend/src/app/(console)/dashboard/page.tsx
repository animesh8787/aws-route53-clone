"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useRouter } from "next/navigation";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { ErrorState } from "@/components/states/States";
import { useDashboard } from "@/features/dns/hooks";

function Metric({ label, value, href }: { label: string; value: number | string; href?: string }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">{href ? <Link href={href} variant="awsui-value-large">{value}</Link> : value}</Box>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  usePageChrome([{ text: "Dashboard", href: "/dashboard" }]);
  const { data, isPending, error, refetch } = useDashboard();

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="Highly available and scalable cloud Domain Name System (DNS) service." actions={<Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>Create hosted zone</Button>}>
        Route 53 dashboard
      </Header>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Spinner size="large" />
      ) : (
        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2" actions={<Button href="/hosted-zones">View hosted zones</Button>}>DNS management</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <Metric label="Hosted zones" value={data.hosted_zones} href="/hosted-zones" />
              <Metric label="Public" value={data.public_zones} />
              <Metric label="Private" value={data.private_zones} />
              <Metric label="Records" value={data.records} />
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button href="/health-checks">View health checks</Button>}>Availability monitoring</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <Metric label="Health checks" value={data.health_checks} />
              <div>
                <Box variant="awsui-key-label">Status</Box>
                <StatusIndicator type={data.unhealthy_health_checks ? "warning" : "success"}>
                  {data.unhealthy_health_checks ? `${data.unhealthy_health_checks} unhealthy` : "All healthy"}
                </StatusIndicator>
              </div>
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2">Recent hosted zones</Header>}>
            <SpaceBetween size="xs">
              {data.recent_zones.length === 0 && <Box color="text-body-secondary">No hosted zones yet.</Box>}
              {data.recent_zones.map((z) => (
                <div key={z.zone_id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <Link href={`/hosted-zones/${z.zone_id}`}>{z.name}</Link>
                  <Box color="text-body-secondary">
                    {z.type === "public" ? "Public" : "Private"} · {z.record_count} records
                  </Box>
                </div>
              ))}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Domain registration</Header>}>
            <SpaceBetween size="xs">
              <Box color="text-body-secondary">Domain registration is not part of this clone.</Box>
              <StatusIndicator type="pending">Coming soon</StatusIndicator>
            </SpaceBetween>
          </Container>
        </ColumnLayout>
      )}
    </SpaceBetween>
  );
}
