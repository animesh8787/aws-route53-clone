import type { ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";

/** AWS service catalogue shown in the Services menu. Only Route 53 exists in this console clone. */
export const SERVICE_GROUPS: { title: string; services: string[] }[] = [
  { title: "Networking and Content Delivery", services: ["Route 53", "CloudFront", "VPC", "API Gateway", "Direct Connect", "Global Accelerator"] },
  { title: "Compute", services: ["EC2", "Lambda", "Elastic Beanstalk", "ECS"] },
  { title: "Storage", services: ["S3", "EFS", "Backup"] },
  { title: "Database", services: ["RDS", "DynamoDB", "ElastiCache"] },
  { title: "Security, Identity and Compliance", services: ["IAM", "Certificate Manager", "WAF and Shield", "Secrets Manager"] },
  { title: "Management and Governance", services: ["CloudWatch", "CloudFormation", "Systems Manager", "Organizations"] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const serviceId = (name: string) => `service-${slug(name)}`;

export const SERVICE_MENU_ITEMS: ButtonDropdownProps.Items = SERVICE_GROUPS.map((g) => ({
  id: slug(g.title),
  text: g.title,
  items: g.services.map((s) => ({ id: serviceId(s), text: s, description: s === "Route 53" ? "Scalable domain name system (DNS)" : undefined })),
}));

export const nameFromServiceId = (id: string): string | null => {
  for (const g of SERVICE_GROUPS) for (const s of g.services) if (serviceId(s) === id) return s;
  return null;
};
