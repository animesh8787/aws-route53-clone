import StatusIndicator from "@cloudscape-design/components/status-indicator";

import type { PasswordRule } from "@/features/auth/password-rules";

/** Live checklist of the password rules; stays quiet until the user starts typing. */
export function PasswordChecklist({ rules, active }: { rules: PasswordRule[]; active: boolean }) {
  return (
    <ul aria-label="Password requirements" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rules.map((r) => (
        <li key={r.id}>
          <StatusIndicator type={!active ? "pending" : r.met ? "success" : "error"}>{r.label}</StatusIndicator>
        </li>
      ))}
    </ul>
  );
}
