import { healthCheckConfig } from "@/features/health-checks/config";
import { profileConfig } from "@/features/profiles/config";
import type { ResourceConfig } from "@/lib/resource-config";

/** Every console section that is a generic resource collection, keyed by route segment. */
export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = Object.fromEntries(
  [healthCheckConfig, profileConfig].map((c) => [c.route, c]),
);

export const getResourceConfig = (route: string): ResourceConfig | undefined => RESOURCE_CONFIGS[route];
