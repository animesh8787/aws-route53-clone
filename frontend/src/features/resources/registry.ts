import { activityConfig } from "@/features/activity/config";
import { cidrCollectionConfig } from "@/features/cidr-collections/config";
import { domainConfig, domainRequestConfig } from "@/features/domains/config";
import { domainListConfig, ruleGroupConfig } from "@/features/firewall/config";
import { globalResolverConfig, outpostResolverConfig, sharedDnsViewConfig } from "@/features/global-resolver/config";
import { healthCheckConfig } from "@/features/health-checks/config";
import { profileConfig } from "@/features/profiles/config";
import { inboundEndpointConfig, outboundEndpointConfig, queryLoggingConfig, resolverRuleConfig, resolverVpcConfig } from "@/features/resolver/config";
import { trafficPolicyConfig } from "@/features/traffic-policies/config";
import { policyRecordConfig } from "@/features/traffic-policies/policy-record-config";
import type { ResourceConfig } from "@/lib/resource-config";

/** Every console section that is a generic resource collection, keyed by route segment. */
export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = Object.fromEntries(
  [
    healthCheckConfig, profileConfig, cidrCollectionConfig, trafficPolicyConfig, policyRecordConfig, domainConfig, domainRequestConfig,
    resolverVpcConfig, inboundEndpointConfig, outboundEndpointConfig, resolverRuleConfig, queryLoggingConfig, domainListConfig, ruleGroupConfig,
    activityConfig, globalResolverConfig, sharedDnsViewConfig, outpostResolverConfig,
  ].map((c) => [c.route, c]),
);

export const getResourceConfig = (route: string): ResourceConfig | undefined => RESOURCE_CONFIGS[route];
