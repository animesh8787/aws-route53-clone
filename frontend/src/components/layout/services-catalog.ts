/** AWS service catalogue shown in the Services menu. Only the services with an `href` exist in this console. */
export interface ServiceEntry {
  name: string;
  description: string;
  href?: string;
}

const s = (name: string, description: string, href?: string): ServiceEntry => ({ name, description, href });

export const SERVICE_CATEGORIES: { title: string; services: ServiceEntry[] }[] = [
  { title: "Analytics", services: [s("Athena", "Query data in S3 using SQL"), s("Kinesis", "Work with real-time streaming data"), s("OpenSearch Service", "Run and scale OpenSearch clusters")] },
  { title: "Application Integration", services: [s("Simple Notification Service", "Pub/sub, SMS, email and mobile push notifications"), s("Simple Queue Service", "Managed message queues"), s("EventBridge", "Serverless event bus")] },
  { title: "Blockchain", services: [s("Amazon Managed Blockchain", "Create and manage scalable blockchain networks")] },
  { title: "Business Applications", services: [s("Amazon Connect", "Omnichannel cloud contact center"), s("Simple Email Service", "Email sending and receiving service")] },
  { title: "Cloud Financial Management", services: [s("Billing and Cost Management", "View and pay bills, analyze and govern your spending, and optimize your costs", "/billing"), s("Cost Explorer", "Visualize and manage costs and usage")] },
  { title: "Compute", services: [s("EC2", "Virtual servers in the cloud"), s("Lambda", "Run code without thinking about servers"), s("Elastic Beanstalk", "Run and manage web apps")] },
  { title: "Containers", services: [s("Elastic Container Service", "Highly secure, reliable and scalable way to run containers"), s("Elastic Kubernetes Service", "The most trusted way to run Kubernetes")] },
  { title: "Customer Enablement", services: [s("Support", "Contact AWS for technical and account support"), s("IQ", "Find AWS Certified freelancers")] },
  { title: "Database", services: [s("RDS", "Managed relational database service"), s("DynamoDB", "Managed NoSQL database"), s("ElastiCache", "In-memory cache")] },
  { title: "Developer Tools", services: [s("CloudShell", "A browser-based shell with AWS CLI access"), s("CodePipeline", "Release software using continuous delivery")] },
  { title: "End User Computing", services: [s("WorkSpaces", "Virtual desktops in the cloud")] },
  { title: "Front-end Web & Mobile", services: [s("Amplify", "Build, deploy, host and manage web and mobile apps"), s("API Gateway", "Build, deploy and manage APIs")] },
  { title: "Game Development", services: [s("GameLift Servers", "Deploy and scale session-based multiplayer games")] },
  { title: "Internet of Things", services: [s("IoT Core", "Connect devices to the cloud")] },
  { title: "Machine Learning", services: [s("Amazon Bedrock", "The easiest way to build and scale generative AI applications"), s("Amazon SageMaker AI", "Build, train and deploy machine learning models")] },
  { title: "Management & Governance", services: [s("CloudWatch", "Monitor resources and applications"), s("CloudTrail", "Track user activity and API usage"), s("Service Quotas", "View and manage your quotas"), s("Organizations", "Central governance and management across accounts")] },
  { title: "Media Services", services: [s("Elemental MediaConvert", "Convert file-based video content")] },
  { title: "Migration & Transfer", services: [s("Application Migration Service", "Migrate applications to AWS"), s("DataSync", "Simple, fast online data transfer")] },
  {
    title: "Networking & Content Delivery",
    services: [
      s("Route 53", "Scalable DNS and Domain Name Registration", "/dashboard"),
      s("Amazon Route 53 Global Resolver", "Secure anycast DNS resolution", "/global-resolvers"),
      s("VPC", "Isolated Cloud Resources"),
      s("CloudFront", "Global content delivery network"),
      s("Application Recovery Controller", "Monitor application recovery readiness and manage failovers"),
      s("Direct Connect", "Dedicated network connection to AWS"),
      s("Global Accelerator", "Improve application availability and performance"),
    ],
  },
  { title: "Quantum Technologies", services: [s("Amazon Braket", "Explore and experiment with quantum computing")] },
  { title: "Satellite", services: [s("Ground Station", "Control satellites and ingest data")] },
  {
    title: "Security, Identity, & Compliance",
    services: [s("IAM", "Manage access to AWS resources"), s("Certificate Manager", "Provision, manage and deploy SSL/TLS certificates"), s("WAF & Shield", "Protect web applications from common exploits"), s("Secrets Manager", "Easily rotate, manage and retrieve secrets")],
  },
  { title: "Storage", services: [s("S3", "Scalable storage in the cloud"), s("EFS", "Managed file storage for EC2"), s("Backup", "Centrally manage and automate backups")] },
];

export const ALL_SERVICES: ServiceEntry[] = SERVICE_CATEGORIES.flatMap((c) => c.services).sort((a, b) => a.name.localeCompare(b.name));

export const findService = (name: string): ServiceEntry | undefined => ALL_SERVICES.find((x) => x.name === name);

/** Services shown under "Recently visited" before the user has opened anything. */
export const DEFAULT_RECENT = ["Route 53", "Amazon Route 53 Global Resolver", "Billing and Cost Management"];
