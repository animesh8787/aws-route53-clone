import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";

/** Mirrors the Route 53 console's left navigation. Every entry opens a working page. */
export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/dashboard" },
  { type: "link", text: "Hosted zones", href: "/hosted-zones" },
  { type: "link", text: "Health checks", href: "/health-checks" },
  { type: "link", text: "Profiles", href: "/profiles" },
  { type: "section", text: "IP-based routing", defaultExpanded: false, items: [{ type: "link", text: "CIDR collections", href: "/cidr-collections" }] },
  {
    type: "section",
    text: "Traffic flow",
    defaultExpanded: false,
    items: [
      { type: "link", text: "Traffic policies", href: "/traffic-policies" },
      { type: "link", text: "Policy records", href: "/policy-records" },
    ],
  },
  {
    type: "section",
    text: "Domains",
    defaultExpanded: false,
    items: [
      { type: "link", text: "Registered domains", href: "/registered-domains" },
      { type: "link", text: "Requests", href: "/domain-requests" },
    ],
  },
  {
    type: "section",
    text: "Resolver",
    defaultExpanded: false,
    items: [
      { type: "link", text: "VPCs", href: "/resolver" },
      { type: "link", text: "Inbound endpoints", href: "/resolver-inbound" },
      { type: "link", text: "Outbound endpoints", href: "/resolver-outbound" },
      { type: "link", text: "Rules", href: "/resolver-rules" },
      { type: "link", text: "Query logging", href: "/resolver-query-logging" },
    ],
  },
  {
    type: "section",
    text: "DNS Firewall",
    defaultExpanded: false,
    items: [
      { type: "link", text: "Rule groups", href: "/dns-firewall" },
      { type: "link", text: "Domain lists", href: "/dns-firewall-domain-lists" },
    ],
  },
];
