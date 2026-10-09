"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { useHelp } from "@/components/layout/HelpContext";
import { ErrorState } from "@/components/states/States";
import { timeAgo, type ActivityEvent } from "@/features/activity/hooks";
import { useDashboard } from "@/features/dns/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api } from "@/lib/api";
import type { Page } from "@/types/api";

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function domainError(value: string): string | null {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  if (!name) return "Enter a domain name.";
  if (name.length > 255) return "A domain name can be up to 255 characters long.";
  const bad = name.split(".").find((label) => !LABEL_RE.test(label));
  return bad !== undefined ? "Each label can contain a-z, 0-9 and hyphens, and cannot start or end with a hyphen." : null;
}

const CARDS: { title: string; text: string; action: string; href: string }[] = [
  { title: "DNS management", text: "A hosted zone tells Route 53 how to respond to DNS queries for a domain such as example.com.", action: "Create hosted zone", href: "/hosted-zones/create" },
  { title: "Availability monitoring", text: "Health checks monitor your applications and web resources, and direct DNS queries to healthy resources.", action: "Create health check", href: "/health-checks/create" },
  { title: "Traffic management", text: "A visual tool that lets you easily create policies for multiple endpoints in complex configurations.", action: "Create policy", href: "/traffic-policies/create" },
  { title: "Domain registration", text: "A domain is the name, such as example.com, that your users use to access your application.", action: "Register domain", href: "/registered-domains/register" },
];

const RESOURCES: [string, string][] = [
  ["Documentation", "https://docs.aws.amazon.com/route53/"],
  ["API reference", "https://docs.aws.amazon.com/Route53/latest/APIReference/Welcome.html"],
  ["FAQs", "https://aws.amazon.com/route53/faqs/"],
  ["Forum - DNS and health checks", "https://repost.aws/tags/TAhC_AIfJqTi-T3rnB1Y4DIw/amazon-route-53"],
  ["Forum - Domain name registration", "https://repost.aws/tags/TAhC_AIfJqTi-T3rnB1Y4DIw/amazon-route-53"],
];

function RegisterDomainBox() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const error = domainError(name);
  const check = () => {
    setTouched(true);
    if (!error) router.push(`/registered-domains/register?name=${encodeURIComponent(name.trim().toLowerCase())}`);
  };
  return (
    <Container header={<Header variant="h2">Register domain</Header>}>
      <SpaceBetween size="s">
        <Box>
          Find and register an available domain, or{" "}
          <Link href="/registered-domains" onFollow={(e) => { e.preventDefault(); router.push("/registered-domains"); }}>
            transfer your existing domains
          </Link>{" "}
          to Route 53.
        </Box>
        <form onSubmit={(e) => { e.preventDefault(); check(); }}>
          <SpaceBetween size="xs">
            <FormField
              stretch
              errorText={touched ? error : undefined}
              constraintText="Each label (each part between dots) can be up to 63 characters long and must start with a-z or 0-9. Maximum length: 255 characters, including dots. Valid characters: a-z, 0-9, and - (hyphen)"
            >
              <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="Enter a domain name" ariaLabel="Domain name to check" />
            </FormField>
            <Button formAction="submit">Check</Button>
          </SpaceBetween>
        </form>
      </SpaceBetween>
    </Container>
  );
}

function NotificationsTable() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(text.trim(), 300);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["activity", "dashboard", q, page],
    queryFn: () => api.get<Page<ActivityEvent>>("/activity", { q: q || undefined, page, page_size: 5 }),
  });
  return (
    <Table
      variant="container"
      header={<Header variant="h2" actions={<Button iconName="refresh" ariaLabel="Refresh notifications" loading={isFetching} onClick={() => void refetch()} />}>Notifications</Header>}
      filter={<TextFilter filteringText={text} filteringPlaceholder="Find notifications" filteringAriaLabel="Find notifications" onChange={({ detail }) => { setText(detail.filteringText); setPage(1); }} />}
      pagination={<Pagination currentPageIndex={page} pagesCount={data?.pages || 1} onChange={({ detail }) => setPage(detail.currentPageIndex)} ariaLabels={{ nextPageLabel: "Next page", previousPageLabel: "Previous page", pageLabel: (n) => `Page ${n}` }} />}
      items={data?.items ?? []}
      loading={!data}
      loadingText="Loading notifications"
      trackBy="id"
      columnDefinitions={[
        {
          id: "resource",
          header: "Resource",
          cell: (e) =>
            e.href ? (
              <Link href={e.href} onFollow={(ev) => { ev.preventDefault(); router.push(e.href ?? "/activity"); }}>
                {e.resource_type}: {e.name}
              </Link>
            ) : (
              `${e.resource_type}: ${e.name}`
            ),
        },
        { id: "status", header: "Status", cell: (e) => <StatusIndicator type={e.action === "deleted" ? "stopped" : "success"}>{e.action.charAt(0).toUpperCase() + e.action.slice(1)}</StatusIndicator> },
        { id: "updated", header: "Last update", cell: (e) => timeAgo(e.created_at) },
      ]}
      empty={<Box textAlign="center" color="text-body-secondary">No notifications to display</Box>}
    />
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const help = useHelp();
  usePageChrome([{ text: "Dashboard", href: "/dashboard" }]);
  const { data, isPending, error, refetch } = useDashboard();
  const n = (key: string) => data?.counts[key] ?? 0;

  const summary: [string, number | string, string][] = data
    ? [
        ["Hosted zones", data.hosted_zones, "/hosted-zones"],
        ["Records", data.records, "/hosted-zones"],
        ["Health checks", data.health_checks, "/health-checks"],
        ["Traffic policies", n("traffic_policy"), "/traffic-policies"],
        ["Registered domains", n("domain"), "/registered-domains"],
        ["Resolver endpoints", n("resolver_endpoints"), "/resolver-inbound"],
      ]
    : [];

  return (
    <SpaceBetween size="l">
      <Header variant="h1" info={<Link variant="info" onFollow={() => help.open()}>Info</Link>}>
        Route 53 Dashboard
      </Header>
      <Container>
        <ColumnLayout columns={4} borders="vertical">
          {CARDS.map((c) => (
            <SpaceBetween key={c.title} size="s" alignItems="center">
              <Box variant="h3" textAlign="center" padding="n">
                {c.title}
              </Box>
              <Box textAlign="center" fontSize="body-s">
                {c.text}
              </Box>
              <Button onClick={() => router.push(c.href)}>{c.action}</Button>
            </SpaceBetween>
          ))}
        </ColumnLayout>
      </Container>
      <RegisterDomainBox />
      <NotificationsTable />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Spinner />
      ) : (
        <Container
          header={
            <Header variant="h2" description="What exists in this account right now.">
              Resource summary
            </Header>
          }
        >
          <ColumnLayout columns={6} variant="text-grid">
            {summary.map(([label, value, href]) => (
              <div key={label}>
                <Box variant="awsui-key-label">{label}</Box>
                <Link href={href} variant="awsui-value-large" onFollow={(e) => { e.preventDefault(); router.push(href); }}>
                  {String(value)}
                </Link>
              </div>
            ))}
          </ColumnLayout>
          {data.unhealthy_health_checks > 0 || n("domains_expiring") > 0 ? (
            <Box margin={{ top: "m" }}>
              <SpaceBetween direction="horizontal" size="l">
                {data.unhealthy_health_checks > 0 && <StatusIndicator type="warning">{data.unhealthy_health_checks} unhealthy health check{data.unhealthy_health_checks === 1 ? "" : "s"}</StatusIndicator>}
                {n("domains_expiring") > 0 && <StatusIndicator type="warning">{n("domains_expiring")} domain{n("domains_expiring") === 1 ? "" : "s"} expiring within 60 days</StatusIndicator>}
              </SpaceBetween>
            </Box>
          ) : null}
        </Container>
      )}
      <Container header={<Header variant="h2">More resources</Header>}>
        <SpaceBetween size="xs">
          {RESOURCES.map(([text, href]) => (
            <Link key={text} href={href} external>
              {text}
            </Link>
          ))}
          <Link href="/billing" onFollow={(e) => { e.preventDefault(); router.push("/billing"); }}>
            Estimated monthly cost
          </Link>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Service health</Header>}>
        <SpaceBetween size="xs">
          <StatusIndicator type="success">Amazon Route 53 is operating normally (simulated status).</StatusIndicator>
          <Box>
            To view the current status of the real Route 53 service, see the{" "}
            <Link href="https://health.aws.amazon.com/health/status" external>
              AWS Service Health Dashboard
            </Link>
            .
          </Box>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
