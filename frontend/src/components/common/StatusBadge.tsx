import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";

const MAP: Record<string, { type: StatusIndicatorProps.Type; label: string }> = {
  COMPLETE: { type: "success", label: "Complete" },
  HEALTHY: { type: "success", label: "Healthy" },
  ACTIVE: { type: "success", label: "Active" },
  OPERATIONAL: { type: "success", label: "Operational" },
  SUCCESSFUL: { type: "success", label: "Successful" },
  ENABLED: { type: "success", label: "Enabled" },
  UNHEALTHY: { type: "error", label: "Unhealthy" },
  FAILED: { type: "error", label: "Failed" },
  ACTION_NEEDED: { type: "warning", label: "Action needed" },
  IN_PROGRESS: { type: "in-progress", label: "In progress" },
  CREATING: { type: "in-progress", label: "Creating" },
  PENDING: { type: "pending", label: "Pending" },
  DISABLED: { type: "stopped", label: "Disabled" },
  EXPIRED: { type: "stopped", label: "Expired" },
};

/** Console-style status indicator for the status strings used by the API. */
export function StatusBadge({ status }: { status: unknown }) {
  const key = String(status ?? "");
  const entry = MAP[key] ?? { type: "info" as const, label: key || "-" };
  return <StatusIndicator type={entry.type}>{entry.label}</StatusIndicator>;
}
