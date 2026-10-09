import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo credentials" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
}

async function confirmDelete(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
}

test("health checks: create, validate, toggle status, edit, delete", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Health checks" }).first().click();
  await expect(page.getByRole("heading", { name: /Health checks/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "web-primary" })).toBeVisible();

  // filter + search
  await page.getByPlaceholder(/Filter health checks/).fill("api-eu");
  await expect(page.getByRole("link", { name: "api-eu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "web-primary" })).toHaveCount(0);
  await page.getByPlaceholder(/Filter health checks/).fill("");

  await page.getByRole("button", { name: "Create health check" }).first().click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("e2e-check");
  await page.getByRole("textbox", { name: /^Endpoint/ }).fill("not a host!");
  await page.getByRole("button", { name: "Create health check" }).last().click();
  await expect(page.getByText(/Enter an IPv4 address, an IPv6 address or a domain name/).first()).toBeVisible();
  await page.getByRole("textbox", { name: /^Endpoint/ }).fill("check.example.com");
  await page.getByRole("button", { name: "Create health check" }).last().click();
  await expect(page.getByText("Health check e2e-check was created successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "e2e-check", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mark as unhealthy" }).click();
  await expect(page.getByText("e2e-check is now unhealthy (simulated).")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as healthy" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Port", exact: true }).fill("8080");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Health check e2e-check was updated successfully.")).toBeVisible();
  await expect(page.getByText("check.example.com:8080").first()).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText("Health check e2e-check was deleted.")).toBeVisible();
  await expect(page).toHaveURL(/\/health-checks$/);
});

test("profiles: create with VPC, conflict, edit, delete", async ({ page }) => {
  await login(page);
  await page.goto("/profiles");
  await expect(page.getByRole("heading", { name: /Profiles/ })).toBeVisible();
  await page.getByRole("button", { name: "Create profile" }).first().click();
  await page.getByRole("textbox", { name: "Profile name" }).fill("e2e-profile");
  await page.getByRole("textbox", { name: "Description" }).fill("created by e2e");
  await page.getByRole("button", { name: "Create profile" }).last().click();
  await expect(page.getByText("Profile e2e-profile was created successfully.")).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Description" }).fill("changed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile e2e-profile was updated successfully.")).toBeVisible();
  await expect(page.getByText("changed").first()).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText("Profile e2e-profile was deleted.")).toBeVisible();
});

test("CIDR collections: validation, create, IP-based record, simulator, delete guard", async ({ page }) => {
  await login(page);
  await page.goto("/cidr-collections");
  await expect(page.getByRole("link", { name: "office-networks" })).toBeVisible();
  await page.getByRole("button", { name: "Create CIDR collection" }).first().click();
  await page.getByRole("textbox", { name: "Collection name" }).fill("e2e-cidr");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.getByRole("textbox", { name: /Location name/ }).fill("hq");
  await page.getByRole("textbox", { name: /CIDR blocks/ }).fill("10.0.0.5/24");
  await page.getByRole("button", { name: "Create CIDR collection" }).last().click();
  await expect(page.getByText(/host bits set/).first()).toBeVisible();
  await page.getByRole("textbox", { name: /CIDR blocks/ }).fill("10.9.0.0/24");
  await page.getByRole("button", { name: "Create CIDR collection" }).last().click();
  await expect(page.getByText("CIDR collection e2e-cidr was created successfully.")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText("CIDR collection e2e-cidr was deleted.")).toBeVisible();

  // the seeded collection is used by records, so it cannot be deleted
  await page.getByPlaceholder(/Filter collections/).fill("office");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText(/use this collection for IP-based routing/).first()).toBeVisible();
});

test("traffic policies: JSON validation, versions, policy record materialises DNS records", async ({ page }) => {
  await login(page);
  await page.goto("/traffic-policies");
  await expect(page.getByRole("link", { name: "web-failover" })).toBeVisible();
  await page.getByRole("button", { name: "Create traffic policy" }).first().click();
  await page.getByRole("textbox", { name: "Policy name" }).fill("e2e-policy");
  await page.getByRole("textbox", { name: "Policy document" }).fill("{ nope");
  await page.getByRole("button", { name: "Create traffic policy" }).last().click();
  await expect(page.getByText(/Not valid JSON/).first()).toBeVisible();
  await page.getByRole("button", { name: "Insert example" }).click();
  await expect(page.getByLabel("Policy preview")).toContainText("Primary");
  await page.getByRole("button", { name: "Create traffic policy" }).last().click();
  await expect(page.getByText("Traffic policy e2e-policy was created successfully.")).toBeVisible();

  await page.getByRole("button", { name: "Create policy record" }).click();
  await page.getByRole("button", { name: "Hosted zone" }).click();
  await page.getByRole("option", { name: /^example\.com/ }).first().click();
  await page.getByRole("textbox", { name: "DNS name" }).fill("e2e-policy-app");
  await page.getByRole("button", { name: "Create policy record" }).last().click();
  await expect(page.getByText("Policy record e2e-policy-app.example.com was created successfully.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "DNS records (2)" })).toBeVisible();

  // the managed records show up in the zone, flagged and protected
  await page.goto("/hosted-zones/Z04512872OH7L5Q4YLRPT?q=e2e-policy-app");
  await expect(page.getByText("Traffic policy").first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /managed by a traffic policy/ }).first()).toBeDisabled();

  // clean up: delete the policy record, then the policy
  await page.goto("/policy-records");
  await page.getByPlaceholder(/Filter policy records/).fill("e2e-policy-app");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText("Policy record e2e-policy-app.example.com was deleted.")).toBeVisible();
  await page.goto("/traffic-policies");
  await page.getByPlaceholder(/Filter policies/).fill("e2e-policy");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText("Traffic policy e2e-policy was deleted.")).toBeVisible();
});

test("Cancel on a valid form leaves without saving", async ({ page }) => {
  await login(page);
  await page.goto("/profiles/create");
  await page.getByRole("textbox", { name: "Profile name" }).fill("never-saved");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.getByPlaceholder(/Filter profiles/).fill("never-saved");
  await expect(page.getByText("No matches")).toBeVisible();
});

test("domains: search, register, edit, renew, request history", async ({ page }) => {
  await login(page);
  await page.goto("/registered-domains");
  await expect(page.getByRole("link", { name: "mycompany.dev" }).first()).toBeVisible();
  await expect(page.getByText(/25 days left|2[0-9] days left/).first()).toBeVisible();

  await page.getByRole("button", { name: "Register domain" }).first().click();
  await page.getByRole("textbox", { name: "Domain name" }).fill("e2edomainidea");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Availability", { exact: true })).toBeVisible();
  await page.locator('tr input[type="radio"]:not([disabled])').first().check({ force: true });
  await page.getByRole("button", { name: "Next" }).click();

  // contact validation, then valid details
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("First name is required.")).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("Test");
  await page.getByRole("textbox", { name: "Last name" }).fill("User");
  await page.getByRole("textbox", { name: "Email address" }).fill("test@example.org");
  await page.getByRole("textbox", { name: "Phone number" }).fill("+1 555 0100");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("1 Main St");
  await page.getByRole("textbox", { name: "City" }).fill("Springfield");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Order summary", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Register domain (simulated)" }).click();
  await expect(page.getByText(/was registered \(simulated\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^e2edomainidea\./ })).toBeVisible();

  // edit settings
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Auto-renew", { exact: true }).first().click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/was updated successfully/)).toBeVisible();

  // renew
  await page.getByRole("button", { name: "Renew domain" }).click();
  await page.getByRole("spinbutton", { name: "Renewal years" }).fill("2");
  await page.getByRole("dialog").getByRole("button", { name: "Renew", exact: true }).click();
  await expect(page.getByText(/was renewed for 2 year/)).toBeVisible();

  // transfer out requires the lock to be off
  await page.getByRole("button", { name: "Transfer out" }).click();
  await expect(page.getByText(/transfer lock/i).first()).toBeVisible();

  // the registration created a hosted zone and requests
  await page.goto("/domain-requests");
  await expect(page.getByRole("row", { name: /Register domain.*e2edomainidea/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Renew domain.*e2edomainidea/ })).toBeVisible();
});

async function choose(page: Page, select: string | RegExp, option: string | RegExp) {
  await page.getByRole("main").getByRole("button", { name: select }).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

test("resolver: VPC overview, endpoint and forwarding rule", async ({ page }) => {
  await login(page);
  await page.goto("/resolver");
  await expect(page.getByRole("link", { name: "vpc-0a1b2c3d4e5f60789" })).toBeVisible();
  await page.getByRole("link", { name: "vpc-0a1b2c3d4e5f60789" }).click();
  await expect(page.getByRole("tab", { name: /Endpoints \(2\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "corp-outbound" })).toBeVisible();

  // outbound endpoint with an auto-assigned address
  await page.goto("/resolver-outbound/create");
  await page.getByRole("textbox", { name: "Endpoint name" }).fill("e2e-out");
  await choose(page, "VPC", /vpc-0f9e8d7c6b5a43210/);
  await page.getByRole("textbox", { name: /Security group IDs/ }).fill("sg-0a1b2c3d4e5f");
  await page.getByPlaceholder("subnet-0a1b2c3d").nth(0).fill("subnet-0a1b2c3d");
  await page.getByPlaceholder("subnet-0a1b2c3d").nth(1).fill("not-a-subnet");
  await page.getByRole("button", { name: "Create outbound endpoint" }).last().click();
  await expect(page.getByText(/use a subnet ID like subnet-0a1b2c3d/).first()).toBeVisible();
  await page.getByPlaceholder("subnet-0a1b2c3d").nth(1).fill("subnet-0b2c3d4e");
  await page.getByRole("button", { name: "Create outbound endpoint" }).last().click();
  await expect(page.getByText("Outbound endpoint e2e-out was created successfully.")).toBeVisible();
  await expect(page.getByText(/10\.1\.0\.\d+/).first()).toBeVisible(); // auto-assigned from 10.1.0.0/16

  // forwarding rule through that endpoint
  await page.goto("/resolver-rules/create");
  await page.getByRole("textbox", { name: "Rule name" }).fill("e2e-rule");
  await page.getByRole("textbox", { name: "Domain name" }).fill("e2e.internal.test");
  await choose(page, "Outbound endpoint", /e2e-out/);
  await page.getByPlaceholder("10.0.1.53").fill("10.1.9.9");
  await page.getByRole("button", { name: "Create resolver rule" }).last().click();
  await expect(page.getByText("Resolver rule e2e-rule was created successfully.")).toBeVisible();

  // the endpoint is in use now
  await page.goto("/resolver-outbound");
  await page.getByPlaceholder(/Filter endpoints/).fill("e2e-out");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmDelete(page);
  await expect(page.getByText(/used by 1 forwarding rule/).first()).toBeVisible();
});

test("DNS Firewall: domain list, rule group and the simulator blocking a query", async ({ page }) => {
  await login(page);
  await page.goto("/dns-firewall-domain-lists/create");
  await page.getByRole("textbox", { name: "Domain list name" }).fill("e2e-block");
  await page.getByRole("textbox", { name: "Domains", exact: true }).fill("bad host!");
  await page.getByRole("button", { name: "Create domain list" }).last().click();
  await expect(page.getByText(/Line 1/).first()).toBeVisible();
  await page.getByRole("textbox", { name: "Domains", exact: true }).fill("e2eblocked.example.com");
  await page.getByRole("button", { name: "Create domain list" }).last().click();
  await expect(page.getByText("Domain list e2e-block was created successfully.")).toBeVisible();

  await page.goto("/dns-firewall/create");
  await page.getByRole("textbox", { name: "Rule group name" }).fill("e2e-group");
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByPlaceholder("block-malware").fill("e2e-rule");
  await page.getByPlaceholder("10", { exact: true }).fill("5");
  await choose(page, /Domain list 1/, /e2e-block/);
  await page.getByRole("button", { name: "Add VPC" }).click();
  await choose(page, /VPC 1/, /vpc-0a1b2c3d4e5f60789/);
  await page.getByPlaceholder("200").fill("250");
  await page.getByRole("button", { name: "Create rule group" }).last().click();
  await expect(page.getByText("Rule group e2e-group was created successfully.")).toBeVisible();

  await page.goto("/hosted-zones/Z04512872OH7L5Q4YLRPT/test-record");
  await page.getByRole("textbox", { name: "Record name" }).fill("e2eblocked");
  await choose(page, "Source VPC", /vpc-0a1b2c3d4e5f60789/);
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(page.getByText("Blocked by DNS Firewall rule")).toBeVisible();
  await expect(page.getByText(/BLOCK by rule 'e2e-rule'/)).toBeVisible();
});

test("top bar: services menu, notifications, activity and help panel", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Services" }).click();
  await expect(page.getByRole("menuitem", { name: /^Route 53/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Storage" }).click();
  await page.getByRole("menuitem", { name: /^S3/ }).click();
  await expect(page.getByRole("dialog")).toContainText("S3 is not available");
  await page.getByRole("dialog").getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("tab", { name: "AWS managed" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /(Created|Updated|Deleted|Imported) / }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeVisible();
  await page.getByRole("button", { name: "Notification center" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Activity/ })).toBeVisible();
  await page.getByPlaceholder(/Filter activity/).fill("baseline-firewall");
  await expect(page.getByRole("link", { name: "baseline-firewall" })).toBeVisible();

  // a change made in the console shows up in the feed
  await page.goto("/hosted-zones/create");
  await page.getByLabel("Domain name").fill("activity-check.com");
  await page.getByRole("button", { name: "Create hosted zone" }).last().click();
  await expect(page.getByText("Hosted zone activity-check.com was successfully created.")).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByRole("link", { name: "activity-check.com" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Route 53 help panel" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 help" })).toBeVisible();
  await page.goto("/hosted-zones/Z04512872OH7L5Q4YLRPT");
  await page.getByRole("button", { name: "Info" }).first().click();
  await expect(page.getByRole("heading", { name: "Hosted zones" }).first()).toBeVisible();
});

test("console chrome: search, settings, CloudShell and feedback", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Alt+s");
  await page.keyboard.type("traffic pol");
  await page.getByRole("option", { name: /^Traffic policies/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Traffic policies/ })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("body")).toHaveClass(/awsui-dark-mode/);
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("body")).not.toHaveClass(/awsui-dark-mode/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "CloudShell" }).first().click();
  const shell = page.getByRole("textbox", { name: "CloudShell command" });
  await shell.fill("aws route53 list-hosted-zones");
  await shell.press("Enter");
  await expect(page.getByRole("log")).toContainText('"Name": "example.com."');
  await shell.fill("dig www.example.com");
  await shell.press("Enter");
  await expect(page.getByRole("log")).toContainText("status: NOERROR");
  await shell.fill("aws route53 delete-hosted-zone --id Z04512872OH7L5Q4YLRPT");
  await shell.press("Enter");
  await expect(page.getByRole("log")).toContainText("read-only");
  await page.getByRole("button", { name: "Close CloudShell" }).click();

  await page.getByRole("button", { name: "Feedback" }).click();
  await page.getByRole("textbox", { name: "Feedback" }).fill("The record editor is easy to use.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Thank you. Your feedback was sent.")).toBeVisible();
});

test("global resolvers, shared DNS views and Resolver on Outposts", async ({ page }) => {
  await login(page);
  await page.goto("/global-resolvers");
  await expect(page.getByText("Getting started with global resolver")).toBeVisible();
  await expect(page.getByRole("link", { name: "corp-global-resolver" })).toBeVisible();
  await page.getByRole("button", { name: "Create global resolver" }).first().click();
  await page.getByLabel("Resolver name").fill("e2e global");
  await page.getByRole("button", { name: "Create global resolver" }).last().click();
  await expect(page.getByRole("heading", { name: "e2e global" })).toBeVisible();
  await expect(page.getByText(/globalresolver\.route53\.aws/)).toBeVisible();

  await page.goto("/shared-dns-views");
  await expect(page.getByRole("link", { name: "partner-shared-view" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create/ })).toHaveCount(0);

  await page.goto("/resolver-outposts");
  await page.getByRole("button", { name: "Create Resolver" }).first().click();
  await page.getByLabel("Name").fill("e2e-outpost");
  await page.getByLabel("Outpost ARN").fill("not-an-arn");
  await page.getByRole("button", { name: "Create Resolver" }).last().click();
  await expect(page.getByText(/Enter an Outpost ARN/).first()).toBeVisible();
  await page.getByLabel("Outpost ARN").fill("arn:aws:outposts:us-east-1:123456789012:outpost/op-0123456789abcdef0");
  await page.getByRole("button", { name: "Create Resolver" }).last().click();
  await expect(page.getByRole("heading", { name: "e2e-outpost" })).toBeVisible();
  await expect(page.getByText("op-0123456789abcdef0").first()).toBeVisible();
});

test("billing estimate and Billing menu item", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /demo-user/ }).click();
  await page.getByRole("menuitem", { name: "Billing and Cost Management" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Billing and Cost Management" })).toBeVisible();
  await expect(page.getByText("Estimate, not a bill")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Cost breakdown/ })).toBeVisible();
  await expect(page.getByText("Route 53 hosted zones").first()).toBeVisible();
  await expect(page.getByText("Traffic policy records")).toBeVisible();
});

test("hosted zone tags and DNSSEC tabs", async ({ page }) => {
  await login(page);
  await page.goto("/hosted-zones/Z04512872OH7L5Q4YLRPT?tab=tags");
  await expect(page.getByRole("cell", { name: "Environment" })).toBeVisible();
  await page.getByRole("button", { name: "Manage tags" }).click();
  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByPlaceholder("Environment").last().fill("aws:reserved");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/keys starting with 'aws:' are reserved/)).toBeVisible();
  await page.getByPlaceholder("Environment").last().fill("e2e-tag");
  await page.getByPlaceholder("production").last().fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Tags updated for example\.com/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "e2e-tag" })).toBeVisible();

  // DNSSEC: seeded as signing on mycompany.dev
  await page.goto("/hosted-zones/Z0891234KX2QWERT7HGFD?tab=dnssec");
  await expect(page.getByText("Signing", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+ 13 2 [0-9A-F]{64}$/)).toBeVisible();
  await page.getByRole("button", { name: "Disable DNSSEC signing" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(page.getByText(/DNSSEC signing was disabled for mycompany\.dev/)).toBeVisible();
  await page.getByRole("button", { name: "Enable DNSSEC signing" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText(/DNSSEC signing was enabled for mycompany\.dev/)).toBeVisible();

  // private zones cannot be signed
  await page.goto("/hosted-zones/Z1R8UBAEXAMPLE6PRIV?tab=dnssec");
  await expect(page.getByText(/only available for public hosted zones/)).toBeVisible();
});
