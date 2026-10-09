"use client";

import Box from "@cloudscape-design/components/box";
import HelpPanelBase from "@cloudscape-design/components/help-panel";
import SpaceBetween from "@cloudscape-design/components/space-between";

import { useHelp } from "@/components/layout/HelpContext";
import { SHORTCUTS } from "@/components/layout/ShortcutsProvider";
import { RESOURCE_CONFIGS } from "@/features/resources/registry";

interface Topic {
  title: string;
  summary: string;
  points: string[];
}

const STATIC_TOPICS: Record<string, Topic> = {
  default: {
    title: "Route 53 help",
    summary: "Route 53 is a DNS service: it translates names such as example.com into the addresses of your resources and routes traffic according to your rules.",
    points: ["Hosted zones hold the DNS records for a domain.", "Health checks and routing policies control where traffic goes.", "Use the Test record button in a hosted zone to see how a query would be answered."],
  },
  "hosted-zones": {
    title: "Hosted zones",
    summary: "A hosted zone is a container for the records that define how to route traffic for a domain and its subdomains.",
    points: ["Public zones answer queries from the internet; private zones answer queries from associated VPCs.", "Every zone starts with NS and SOA records that cannot be deleted.", "Import a BIND zone file or export the zone as JSON or BIND."],
  },
};

export function topicFor(id: string | null): Topic {
  if (id && RESOURCE_CONFIGS[id]) {
    const c = RESOURCE_CONFIGS[id];
    return { title: c.title, ...c.help };
  }
  return STATIC_TOPICS[id ?? ""] ?? STATIC_TOPICS.default;
}

/** Content of the right-hand tools panel. */
export function HelpPanel() {
  const { topic } = useHelp();
  const t = topicFor(topic);
  return (
    <HelpPanelBase header={<h2>{t.title}</h2>}>
      <SpaceBetween size="m">
        <Box>{t.summary}</Box>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {t.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <Box variant="h4">Keyboard shortcuts</Box>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <Box variant="code" display="inline">{s.keys}</Box> {s.action}
            </li>
          ))}
        </ul>
      </SpaceBetween>
    </HelpPanelBase>
  );
}
