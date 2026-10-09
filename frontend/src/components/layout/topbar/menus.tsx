"use client";

import Icon from "@cloudscape-design/components/icon";
import { useState } from "react";

import type { ThemePreference } from "@/components/layout/ThemeProvider";
import type { User } from "@/types/api";

export const formatAccountId = (id: string) => id.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3");

function CopyValue({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <>
      <div className="r53-key">{label}</div>
      <div className="r53-copy-row">
        <button type="button" className="r53-link-btn" aria-label={`Copy ${label}`} onClick={copy}>
          <Icon name="copy" variant="link" />
        </button>
        <span>{copied ? "Copied" : display ?? value}</span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ settings
export function SettingsMenu({ preference, onPreference, onAllSettings }: { preference: ThemePreference; onPreference: (p: ThemePreference) => void; onAllSettings: () => void }) {
  return (
    <>
      <div className="r53-pop-section">
        <h2>Current user settings</h2>
      </div>
      <div className="r53-pop-section">
        <label className="r53-field-label" htmlFor="r53-language">
          Language
        </label>
        <select id="r53-language" className="r53-select" defaultValue="browser" aria-describedby="r53-language-note">
          <option value="browser">Browser default</option>
          <option value="en-US">English (US)</option>
        </select>
        <p id="r53-language-note" className="r53-muted" style={{ margin: "6px 0 0" }}>
          The console is available in English.
        </p>
      </div>
      <div className="r53-pop-section" role="radiogroup" aria-labelledby="r53-visual-mode">
        <div id="r53-visual-mode" className="r53-field-label">
          Visual mode
        </div>
        {([["auto", "Browser default"], ["light", "Light"], ["dark", "Dark"]] as const).map(([value, text]) => (
          <label key={value} className="r53-radio">
            <input type="radio" name="r53-visual-mode" value={value} checked={preference === value} onChange={() => onPreference(value)} />
            {text}
          </label>
        ))}
      </div>
      <div className="r53-pop-section">
        <button type="button" className="r53-link-btn" onClick={onAllSettings}>
          See all user settings
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ account
export function AccountMenu({ user, onNavigate, onSignOut }: { user: User; onNavigate: (href: string) => void; onSignOut: () => void }) {
  return (
    <>
      <div className="r53-pop-section">
        <CopyValue label="Account ID" value={user.account_id} display={formatAccountId(user.account_id)} />
        <CopyValue label="Account name" value={user.display_name} />
        <CopyValue label="Signed-in user" value={user.email} />
      </div>
      <ul className="r53-menu" role="menu" aria-label="Account">
        {[
          ["Account", "/account"],
          ["Security credentials", "/security-credentials"],
          ["Billing and Cost Management", "/billing"],
          ["Activity", "/activity"],
        ].map(([text, href]) => (
          <li key={text} role="none">
            <button type="button" role="menuitem" className="r53-menu-item" onClick={() => onNavigate(href)}>
              {text}
            </button>
          </li>
        ))}
      </ul>
      <div className="r53-pop-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="r53-pill-btn r53-primary" onClick={onSignOut}>
          <Icon name="sign-out" />
          Sign out
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ help
export function HelpMenu({ onHelpPanel, onShortcuts, onFeedback }: { onHelpPanel: () => void; onShortcuts: () => void; onFeedback: () => void }) {
  const docs: [string, string][] = [
    ["Documentation", "https://docs.aws.amazon.com/route53/"],
    ["Getting started", "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/getting-started.html"],
    ["API reference", "https://docs.aws.amazon.com/Route53/latest/APIReference/Welcome.html"],
  ];
  return (
    <ul className="r53-menu" role="menu" aria-label="Help">
      <li role="none">
        <button type="button" role="menuitem" className="r53-menu-item" onClick={onHelpPanel}>
          Route 53 help panel
        </button>
      </li>
      <li role="none">
        <button type="button" role="menuitem" className="r53-menu-item" onClick={onShortcuts}>
          Keyboard shortcuts
        </button>
      </li>
      {docs.map(([text, href]) => (
        <li key={text} role="none">
          <a role="menuitem" className="r53-menu-item" href={href} target="_blank" rel="noopener noreferrer">
            {text}
            <Icon name="external" variant="inverted" />
          </a>
        </li>
      ))}
      <li role="none">
        <button type="button" role="menuitem" className="r53-menu-item" onClick={onFeedback}>
          Send feedback
        </button>
      </li>
    </ul>
  );
}

// ------------------------------------------------------------------ region
const REGIONS: [string, string][] = [
  ["United States", "N. Virginia|us-east-1;Ohio|us-east-2;N. California|us-west-1;Oregon|us-west-2"],
  ["Asia Pacific", "Mumbai|ap-south-1;Singapore|ap-southeast-1;Sydney|ap-southeast-2;Tokyo|ap-northeast-1"],
  ["Europe", "Frankfurt|eu-central-1;Ireland|eu-west-1;London|eu-west-2;Stockholm|eu-north-1"],
];

export function RegionMenu() {
  return (
    <>
      <div className="r53-pop-section">
        <h2>Global</h2>
        <p className="r53-muted" style={{ margin: "6px 0 0" }}>
          Route 53 is a global service: hosted zones, health checks and domains are not tied to a Region. Resolver resources use the Region of their VPC.
        </p>
      </div>
      {REGIONS.map(([group, list]) => (
        <div key={group} className="r53-pop-section" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <div className="r53-key" style={{ marginBottom: 4 }}>
            {group}
          </div>
          {list.split(";").map((entry) => {
            const [name, code] = entry.split("|");
            return (
              <div key={code} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#b4b4bb" }}>
                <span>{name}</span>
                <span>{code}</span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
