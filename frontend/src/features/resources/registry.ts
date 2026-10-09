import { cidrCollectionConfig } from "@/features/cidr-collections/config";
import { healthCheckConfig } from "@/features/health-checks/config";
import { profileConfig } from "@/features/profiles/config";
import { policyRecordConfig } from "@/features/traffic-policies/policy-record-config";
import { trafficPolicyConfig } from "@/features/traffic-policies/config";
import type { ResourceConfig } from "@/lib/resource-config";

/** Every console section that is a generic resource collection, keyed by route segment. */
export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = Object.fromEntries(
  [healthCheckConfig, profileConfig, cidrCollectionConfig, trafficPolicyConfig, policyRecordConfig].map((c) => [c.route, c]),
);

export const getResourceConfig = (route: string): ResourceConfig | undefined => RESOURCE_CONFIGS[route];
