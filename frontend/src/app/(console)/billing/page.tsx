"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Table from "@cloudscape-design/components/table";
import { useQuery } from "@tanstack/react-query";

import { usePageChrome } from "@/components/layout/ChromeContext";
import { ErrorState } from "@/components/states/States";
import { api } from "@/lib/api";

interface Line {
  service: string;
  description: string;
  quantity: number;
  unit_price: number;
  monthly: number;
}

interface Estimate {
  currency: string;
  total: number;
  lines: Line[];
  by_service: { service: string; monthly: number }[];
  prices: { id: string; service: string; unit: string; price: number | null }[];
  disclaimer: string;
}

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BillingPage() {
  usePageChrome([{ text: "Billing and Cost Management", href: "/billing" }]);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ["billing"], queryFn: () => api.get<Estimate>("/billing/estimate") });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} title="Unable to load the cost estimate" />;
  if (isPending) return <Spinner size="large" />;

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description="A monthly cost estimate computed from the resources in your account.">
        Billing and Cost Management
      </Header>
      <Alert type="info" header="Estimate, not a bill">
        {data.disclaimer}
      </Alert>
      <Container header={<Header variant="h2">Estimated monthly cost</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Estimated total</Box>
            <Box variant="awsui-value-large">{usd(data.total)}</Box>
          </div>
          {data.by_service.slice(0, 2).map((s) => (
            <div key={s.service}>
              <Box variant="awsui-key-label">{s.service}</Box>
              <Box variant="awsui-value-large">{usd(s.monthly)}</Box>
            </div>
          ))}
        </ColumnLayout>
      </Container>
      <Table
        header={<Header variant="h2" counter={`(${data.lines.length})`}>Cost breakdown</Header>}
        items={data.lines}
        trackBy={(l) => `${l.service}-${l.description}`}
        columnDefinitions={[
          { id: "service", header: "Service", cell: (l) => l.service },
          { id: "desc", header: "Item", cell: (l) => l.description },
          { id: "qty", header: "Quantity", cell: (l) => l.quantity },
          { id: "unit", header: "Unit price", cell: (l) => usd(l.unit_price) },
          { id: "monthly", header: "Monthly estimate", cell: (l) => usd(l.monthly) },
        ]}
        empty={<Box textAlign="center" color="text-body-secondary">No billable resources yet.</Box>}
        footer={<Box textAlign="right" variant="strong">Total: {usd(data.total)} per month</Box>}
      />
      <ExpandableSection variant="container" headerText="Pricing assumptions">
        <Table
          variant="embedded"
          items={data.prices}
          trackBy="id"
          columnDefinitions={[
            { id: "service", header: "Service", cell: (p) => p.service },
            { id: "unit", header: "Billing unit", cell: (p) => p.unit },
            { id: "price", header: "Illustrative price", cell: (p) => (p.price === null ? "Varies by top-level domain" : usd(p.price)) },
          ]}
        />
      </ExpandableSection>
    </SpaceBetween>
  );
}
