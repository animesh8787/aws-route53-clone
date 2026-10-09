"use client";

import Icon from "@cloudscape-design/components/icon";
import { useState } from "react";

import { timeAgo, type ActivityEvent } from "@/features/activity/hooks";
import type { DashboardSummary } from "@/types/api";

type Tab = "recent" | "user" | "aws";

interface Row {
  key: string;
  source: "user" | "aws";
  title: string;
  text: string;
  when: string;
  sortKey: number;
  href: string | null;
  unread: boolean;
  sensitive: boolean;
}

const SENSITIVE_TYPES = new Set(["Account", "Session", "Password", "Security credentials"]);

function userRows(items: ActivityEvent[]): Row[] {
  return items.map((e) => ({
    key: `u${e.id}`,
    source: "user",
    title: e.resource_type,
    text: `${e.action.charAt(0).toUpperCase()}${e.action.slice(1)} ${e.resource_type.toLowerCase()}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`,
    when: timeAgo(e.created_at),
    sortKey: new Date(e.created_at.endsWith("Z") ? e.created_at : `${e.created_at}Z`).getTime(),
    href: e.href,
    unread: !e.is_read,
    sensitive: SENSITIVE_TYPES.has(e.resource_type),
  }));
}

/** Service-side events derived from the account's current state (what AWS Health / Route 53 would notify about). */
function awsRows(summary: DashboardSummary | undefined): Row[] {
  if (!summary) return [];
  const now = Date.now();
  const rows: Row[] = [];
  if (summary.unhealthy_health_checks) {
    rows.push({
      key: "aws-hc", source: "aws", title: "AWS Health Event", when: "Ongoing", sortKey: now, href: "/health-checks", unread: true, sensitive: false,
      text: `[Action may be required] ${summary.unhealthy_health_checks} Route 53 health check${summary.unhealthy_health_checks === 1 ? " is" : "s are"} reporting Unhealthy.`,
    });
  }
  const expiring = summary.counts.domains_expiring ?? 0;
  if (expiring) {
    rows.push({
      key: "aws-dom", source: "aws", title: "Route 53 Domains", when: "Ongoing", sortKey: now - 1, href: "/registered-domains", unread: true, sensitive: false,
      text: `${expiring} registered domain${expiring === 1 ? " expires" : "s expire"} within 60 days. Turn on auto-renew to keep ${expiring === 1 ? "it" : "them"}.`,
    });
  }
  const pending = summary.counts.requests_pending ?? 0;
  if (pending) {
    rows.push({
      key: "aws-req", source: "aws", title: "Route 53 Domains", when: "In progress", sortKey: now - 2, href: "/domain-requests", unread: false, sensitive: false,
      text: `${pending} domain request${pending === 1 ? " is" : "s are"} in progress.`,
    });
  }
  rows.push({
    key: "aws-ok", source: "aws", title: "AWS Health Event", when: "Today", sortKey: now - 3, href: null, unread: false, sensitive: false,
    text: "Amazon Route 53 is operating normally in all locations (simulated service status).",
  });
  return rows;
}

interface Props {
  events: ActivityEvent[];
  summary: DashboardSummary | undefined;
  unread: number;
  onMarkRead: () => void;
  onNavigate: (href: string) => void;
}

export function NotificationsMenu({ events, summary, unread, onMarkRead, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>("recent");
  const [sensitive, setSensitive] = useState(false);
  const user = userRows(events);
  const aws = awsRows(summary);
  const rows = (tab === "user" ? user : tab === "aws" ? aws : [...user, ...aws].sort((a, b) => b.sortKey - a.sortKey)).filter((r) => sensitive || !r.sensitive);

  return (
    <>
      <div className="r53-pop-head">
        <h2>Notifications</h2>
        <button type="button" className="r53-link-btn" onClick={() => onNavigate("/activity")}>
          Notification center
        </button>
      </div>
      <div className="r53-tabs" role="tablist" aria-label="Notification types">
        {([["recent", "Most recent", null], ["user", "User configured", "user-profile"], ["aws", "AWS managed", "multiscreen"]] as const).map(([id, text, icon]) => (
          <button key={id} type="button" role="tab" className="r53-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {icon && <Icon name={icon} variant={tab === id ? "link" : "inverted"} />}
            {text}
          </button>
        ))}
      </div>
      <div role="list" aria-label="Notifications list" style={{ maxHeight: 360, overflow: "auto" }}>
        {rows.length === 0 && <p className="r53-muted" style={{ padding: "16px 20px", margin: 0 }}>No notifications.</p>}
        {rows.map((r) => (
          <button key={r.key} type="button" role="listitem" className="r53-event" onClick={() => r.href && onNavigate(r.href)} disabled={!r.href}>
            <span className="r53-event-head">
              <span className={r.unread ? "r53-unread" : undefined}>
                <Icon name={r.source === "aws" ? "multiscreen" : "user-profile"} variant="link" /> {r.title}
              </span>
              <time>{r.when}</time>
            </span>
            <p>{r.text}</p>
          </button>
        ))}
      </div>
      <div className="r53-pop-foot">
        <label className="r53-radio" style={{ padding: 0 }}>
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
          Include sensitive events
        </label>
        <button type="button" className="r53-link-btn" onClick={onMarkRead} disabled={!unread}>
          Mark all as read
        </button>
      </div>
    </>
  );
}
