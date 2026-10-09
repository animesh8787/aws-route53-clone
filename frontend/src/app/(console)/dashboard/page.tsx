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
  const router = useRouter();
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">
        {href ? (
          <Link href={href} variant="awsui-value-large" onFollow={(e) => { e.preventDefault(); router.push(href); }}>
            {value}
          </Link>
        ) : (
          value
        )}
      </Box>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  usePageChrome([{ text: "Dashboard", href: "/dashboard" }]);
  const { data, isPending, error, refetch } = useDashboard();
  const n = (key: string) => data?.counts[key] ?? 0;

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Highly available and scalable cloud Domain Name System (DNS) service."
        actions={<Button variant="primary" onClick={() => router.push("/hosted-zones/create")}>Create hosted zone</Button>}
      >
        Route 53 dashboard
      </Header>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Spinner size="large" />
      ) : (
        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/hosted-zones")}>View hosted zones</Button>}>DNS management</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <Metric label="Hosted zones" value={data.hosted_zones} href="/hosted-zones" />
              <Metric label="Public" value={data.public_zones} />
              <Metric label="Private" value={data.private_zones} />
              <Metric label="Records" value={data.records} />
              <Metric label="Profiles" value={n("profile")} href="/profiles" />
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/traffic-policies")}>View traffic policies</Button>}>Traffic management</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <Metric label="Traffic policies" value={n("traffic_policy")} href="/traffic-policies" />
              <Metric label="Policy records" value={n("policy_record")} href="/policy-records" />
              <Metric label="IP-based collections" value={n("cidr_collection")} href="/cidr-collections" />
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/health-checks")}>View health checks</Button>}>Availability monitoring</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <Metric label="Health checks" value={data.health_checks} href="/health-checks" />
              <div>
                <Box variant="awsui-key-label">Status</Box>
                <StatusIndicator type={data.unhealthy_health_checks ? "warning" : "success"}>
                  {data.unhealthy_health_checks ? `${data.unhealthy_health_checks} unhealthy` : "All healthy"}
                </StatusIndicator>
              </div>
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/registered-domains/register")}>Register domain</Button>}>Domain registration</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <Metric label="Registered domains" value={n("domain")} href="/registered-domains" />
              <div>
                <Box variant="awsui-key-label">Expiring within 60 days</Box>
                <StatusIndicator type={n("domains_expiring") ? "warning" : "success"}>{n("domains_expiring") ? `${n("domains_expiring")} expiring` : "None"}</StatusIndicator>
              </div>
              <Metric label="Requests in progress" value={n("requests_pending")} href="/domain-requests" />
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/resolver")}>View VPCs</Button>}>Resolver</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <Metric label="Endpoints" value={n("resolver_endpoints")} href="/resolver-inbound" />
              <Metric label="Rules" value={n("resolver_rule")} href="/resolver-rules" />
              <Metric label="Query logging" value={n("query_logging")} href="/resolver-query-logging" />
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2" actions={<Button onClick={() => router.push("/dns-firewall")}>View rule groups</Button>}>DNS Firewall</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <Metric label="Rule groups" value={n("fw_rule_group")} href="/dns-firewall" />
              <Metric label="Domain lists" value={n("fw_domain_list")} href="/dns-firewall-domain-lists" />
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
        </ColumnLayout>
      )}
    </SpaceBetween>
  );
}
