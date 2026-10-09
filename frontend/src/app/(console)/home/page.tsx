"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import RadioGroup from "@cloudscape-design/components/radio-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePageChrome } from "@/components/layout/ChromeContext";

const GET_STARTED = [
  { value: "/registered-domains/register", label: "Register a domain", description: "Find an available domain name and register it. Route 53 also creates a hosted zone for it." },
  { value: "/hosted-zones/create", label: "Create hosted zones", description: "Route internet traffic for a domain you already own, or traffic inside your VPCs." },
  { value: "/health-checks/create", label: "Configure health checks", description: "Monitor endpoints and route traffic only to healthy resources." },
  { value: "/traffic-policies/create", label: "Manage traffic globally", description: "Build routing policies with Traffic Flow and apply them to DNS names." },
  { value: "/resolver", label: "Configure Resolver", description: "Resolve DNS queries between your VPCs and your network." },
];

const PRODUCTS: { title: string; text: string; href: string }[] = [
  { title: "Domain names", text: "A domain is the name, such as example.com, that your users use to access your application.", href: "/registered-domains" },
  { title: "Hosted zones", text: "Specify how you want Route 53 to respond to DNS queries for a domain such as example.com.", href: "/hosted-zones" },
  { title: "Health checks", text: "Monitor your applications and web resources, and direct DNS queries to healthy resources.", href: "/health-checks" },
  { title: "Traffic flow", text: "Use a visual tool to create policies for multiple endpoints in complex configurations.", href: "/traffic-policies" },
  { title: "Resolver", text: "Route DNS queries between your VPCs and your network.", href: "/resolver" },
];

const BENEFITS: [string, string][] = [
  ["Highly available and reliable", "Route 53 is built on a globally distributed set of DNS servers so that your end users are consistently routed to your application."],
  ["Designed for use with other AWS services", "Map domain names to EC2 instances, S3 buckets, CloudFront distributions and other AWS resources."],
  ["Simple", "Sign up, create a hosted zone and Route 53 starts answering DNS queries within minutes."],
  ["Flexible", "Route traffic based on endpoint health, geographic location, latency, weights or the client's IP address."],
];

function HowItWorks() {
  const box = { fill: "none", stroke: "#539fe5", strokeWidth: 3 };
  return (
    <svg viewBox="0 0 640 300" role="img" aria-label="Users query Route 53, which answers with the address of a healthy endpoint" style={{ width: "100%", height: "auto", background: "#0f1b2a", borderRadius: 12 }}>
      <text x="24" y="36" fill="#ffffff" fontSize="18" fontWeight="700" fontFamily="Open Sans, Arial">How Route 53 answers a query</text>
      <circle cx="90" cy="160" r="38" {...box} stroke="#2ea597" />
      <text x="90" y="166" textAnchor="middle" fill="#ffffff" fontSize="14" fontFamily="Arial">Users</text>
      <path d="M135 160 H240" stroke="#ff9900" strokeWidth="3" strokeDasharray="8 6" />
      <polygon points="320,100 370,128 370,192 320,220 270,192 270,128" {...box} stroke="#ffffff" />
      <text x="320" y="156" textAnchor="middle" fill="#ffffff" fontSize="26" fontWeight="700" fontFamily="Arial">53</text>
      <text x="320" y="182" textAnchor="middle" fill="#d1d5db" fontSize="12" fontFamily="Arial">Route 53</text>
      <path d="M375 140 L470 90 M375 160 H470 M375 180 L470 230" stroke="#ff9900" strokeWidth="3" strokeDasharray="8 6" />
      <rect x="480" y="66" width="128" height="44" rx="8" {...box} />
      <text x="544" y="93" textAnchor="middle" fill="#ffffff" fontSize="13" fontFamily="Arial">Load balancer</text>
      <rect x="480" y="138" width="128" height="44" rx="8" {...box} />
      <text x="544" y="165" textAnchor="middle" fill="#ffffff" fontSize="13" fontFamily="Arial">EC2 instance</text>
      <rect x="480" y="210" width="128" height="44" rx="8" {...box} />
      <text x="544" y="237" textAnchor="middle" fill="#ffffff" fontSize="13" fontFamily="Arial">S3 website</text>
      <text x="24" y="284" fill="#b4b4bb" fontSize="12" fontFamily="Arial">Health checks keep traffic away from unhealthy endpoints; routing policies decide which healthy endpoint answers.</text>
    </svg>
  );
}

export default function HomePage() {
  usePageChrome([{ text: "Home", href: "/home" }]);
  const router = useRouter();
  const [choice, setChoice] = useState(GET_STARTED[0].value);
  const go = (href: string) => router.push(href);

  return (
    <SpaceBetween size="xl">
      <div style={{ background: "#0f141a", color: "#ffffff", margin: "-20px -40px 0", padding: "32px 40px 40px", borderRadius: 0 }}>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <div>
            <div style={{ fontSize: 12, color: "#d1d5db", marginBottom: 8 }}>Networking & Content Delivery</div>
            <h1 style={{ margin: 0, fontSize: 40, lineHeight: "48px", fontWeight: 700, color: "#ffffff" }}>Amazon Route 53</h1>
            <div style={{ fontSize: 32, lineHeight: "40px", fontWeight: 300, marginTop: 4, color: "#ffffff" }}>A reliable way to route users to internet applications</div>
            <p style={{ fontSize: 14, color: "#d1d5db", marginTop: 16, maxWidth: 640 }}>
              Amazon Route 53 is a highly available and scalable cloud Domain Name System (DNS) web service. Register domains, route traffic with hosted zones and
              routing policies, monitor endpoints with health checks and resolve DNS inside your VPCs.
            </p>
          </div>
          <Container header={<Header variant="h2">Get started with Route 53</Header>}>
            <SpaceBetween size="m">
              <RadioGroup value={choice} onChange={({ detail }) => setChoice(detail.value)} items={GET_STARTED} ariaLabel="What do you want to do first?" />
              <Button variant="primary" onClick={() => go(choice)}>
                Get started
              </Button>
            </SpaceBetween>
          </Container>
        </Grid>
      </div>

      <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">How it works</Header>}>
            <HowItWorks />
          </Container>
          <Container header={<Header variant="h2">Products</Header>}>
            <SpaceBetween size="m">
              {PRODUCTS.map((p) => (
                <div key={p.title}>
                  <Link variant="primary" href={p.href} onFollow={(e) => { e.preventDefault(); go(p.href); }}>
                    {p.title}
                  </Link>
                  <Box color="text-body-secondary">{p.text}</Box>
                </div>
              ))}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Benefits and features</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              {BENEFITS.map(([title, text]) => (
                <div key={title}>
                  <Box variant="h3" padding={{ top: "n" }}>
                    {title}
                  </Box>
                  <Box>{text}</Box>
                </div>
              ))}
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2">Use cases</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <div>
                <Box variant="h3" padding={{ top: "n" }}>
                  Global traffic management
                </Box>
                <Box>
                  Traffic Flow lets you build routing configurations for resources in many locations.{" "}
                  <Link href="/traffic-policies" onFollow={(e) => { e.preventDefault(); go("/traffic-policies"); }}>
                    Create a traffic policy
                  </Link>
                </Box>
              </div>
              <div>
                <Box variant="h3" padding={{ top: "n" }}>
                  Alias to AWS resources
                </Box>
                <Box>
                  Alias records map your zone apex (example.com) to load balancers, CloudFront distributions or S3 website endpoints.{" "}
                  <Link href="/hosted-zones" onFollow={(e) => { e.preventDefault(); go("/hosted-zones"); }}>
                    Open hosted zones
                  </Link>
                </Box>
              </div>
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2">Related services</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <div>
                <Link href="https://aws.amazon.com/cloudfront/" external>
                  Amazon CloudFront
                </Link>
                <Box>Speed up delivery of your website by routing users to a CloudFront distribution with an alias record.</Box>
              </div>
              <div>
                <Link href="https://aws.amazon.com/cloudwatch/" external>
                  Amazon CloudWatch
                </Link>
                <Box>Monitor the status of your Route 53 health checks and get notified when it changes.</Box>
              </div>
            </ColumnLayout>
          </Container>
        </SpaceBetween>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Pricing (US)</Header>}>
            <SpaceBetween size="xs">
              <Box>Pay only for what you use: hosted zones, queries, health checks and domains.</Box>
              <Link href="/billing" onFollow={(e) => { e.preventDefault(); go("/billing"); }}>
                Estimate your monthly cost
              </Link>
              <Link href="https://aws.amazon.com/route53/pricing/" external>
                View pricing
              </Link>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">More resources</Header>}>
            <SpaceBetween size="xs">
              <Link href="https://docs.aws.amazon.com/route53/" external>
                Documentation
              </Link>
              <Link href="https://docs.aws.amazon.com/Route53/latest/APIReference/Welcome.html" external>
                API reference
              </Link>
              <Link href="https://aws.amazon.com/route53/faqs/" external>
                FAQs
              </Link>
              <Link href="/dashboard" onFollow={(e) => { e.preventDefault(); go("/dashboard"); }}>
                Go to the Route 53 dashboard
              </Link>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Grid>
    </SpaceBetween>
  );
}
