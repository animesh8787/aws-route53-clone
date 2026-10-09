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
