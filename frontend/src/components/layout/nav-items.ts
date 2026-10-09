import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import { createElement } from "react";

const NEW = createElement("span", { className: "r53-new-badge" }, "New");

/** Mirrors the Route 53 console's left navigation. Every entry opens a working page. */
export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/dashboard" },
  { type: "link", text: "Hosted zones", href: "/hosted-zones" },
  { type: "link", text: "Health checks", href: "/health-checks" },
  { type: "link", text: "Profiles", href: "/profiles" },
  {
    type: "section",
    text: "Global Resolver",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Global resolvers", href: "/global-resolvers", info: NEW },
      { type: "link", text: "Shared DNS views", href: "/shared-dns-views", info: NEW },
    ],
  },
  {
    type: "section",
    text: "VPC Resolver",
    defaultExpanded: true,
    items: [
      { type: "link", text: "VPCs", href: "/resolver" },
      { type: "link", text: "Inbound endpoints", href: "/resolver-inbound" },
      { type: "link", text: "Outbound endpoints", href: "/resolver-outbound" },
      { type: "link", text: "Rules", href: "/resolver-rules" },
      { type: "link", text: "Query logging", href: "/resolver-query-logging" },
      { type: "link", text: "Outposts", href: "/resolver-outposts" },
    ],
  },
  {
    type: "section",
    text: "Domains",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Registered domains", href: "/registered-domains" },
      { type: "link", text: "Requests", href: "/domain-requests" },
    ],
  },
  { type: "section", text: "IP-based routing", defaultExpanded: true, items: [{ type: "link", text: "CIDR collections", href: "/cidr-collections" }] },
  {
    type: "section",
    text: "Traffic flow",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Traffic policies", href: "/traffic-policies" },
      { type: "link", text: "Policy records", href: "/policy-records" },
    ],
  },
  { type: "divider" },
  {
    type: "section",
    text: "DNS Firewall",
    defaultExpanded: true,
    items: [
      { type: "link", text: "Rule groups", href: "/dns-firewall" },
      { type: "link", text: "Domain lists", href: "/dns-firewall-domain-lists" },
    ],
  },
  { type: "link", text: "Application Recovery Controller", href: "#application-recovery-controller", external: true },
];

/** Navigation entries that belong to other AWS services: following them explains they are not part of this console. */
export const NAV_UNAVAILABLE: Record<string, string> = {
  "#application-recovery-controller": "Application Recovery Controller",
};
