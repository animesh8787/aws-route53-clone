import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const OUT = path.resolve("..", "docs", "screenshots");
const EXAMPLE = "Z04512872OH7L5Q4YLRPT";

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function chooseOption(page: Page, label: string | RegExp, option: RegExp | string) {
  await page.getByRole("button", { name: label }).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo credentials" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
}

test("capture documentation screenshots", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto("/login");
  await shot(page, "01-login");
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email address" }).fill("you@example.org");
  await page.locator('input[type="password"]').first().fill("Correct-horse-42");
  await shot(page, "01b-signup");
  await login(page);
  await shot(page, "02-dashboard");

  await page.goto("/hosted-zones");
  await expect(page.getByRole("link", { name: "acme-corp.io" })).toBeVisible();
  await shot(page, "03-hosted-zones");

  await page.goto("/hosted-zones/create");
  await page.getByLabel("Domain name").fill("my-new-site.com");
  await page.getByLabel(/Description/).fill("Marketing website");
  await shot(page, "04-create-hosted-zone");

  await page.goto(`/hosted-zones/${EXAMPLE}`);
  await expect(page.getByRole("link", { name: "example.com", exact: true }).first()).toBeVisible();
  await shot(page, "05-hosted-zone-detail");

  await page.getByPlaceholder("Filter records by name, type or value").fill("mail");
  await chooseOption(page, "Filter by record type", /^MX/);
  await expect(page.getByRole("row", { name: /MX/ }).first()).toBeVisible();
  await shot(page, "10-search-filter");

  for (const [file, type] of [["07-create-a-record", "A"], ["08-create-mx-record", "MX"], ["09-create-srv-record", "SRV"], ["09b-create-caa-record", "CAA"]] as const) {
    await page.goto(`/hosted-zones/${EXAMPLE}/records/create`);
    if (type !== "A") await chooseOption(page, "Record type", new RegExp(`^${type}`));
    if (type === "A") {
      await page.getByLabel("Record name").fill("api");
      await page.getByLabel(/^Value/).fill("192.0.2.44");
    }
    await shot(page, file);
  }

  await page.goto(`/hosted-zones/${EXAMPLE}/records/create`);
  await chooseOption(page, "Routing policy", /^Weighted/);
  await page.mouse.wheel(0, 700);
  await shot(page, "09c-weighted-routing");

  await page.goto(`/hosted-zones/${EXAMPLE}?q=cdn`);
  await page.getByRole("checkbox", { name: /Select cdn.example.com/ }).check();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "11-delete-record-confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await page.goto(`/hosted-zones/${EXAMPLE}/import`);
  await page.getByRole("button", { name: "Use sample zone file" }).click();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText(/valid, \d+ with errors/)).toBeVisible();
  await shot(page, "12-import-preview");

  await page.goto(`/hosted-zones/${EXAMPLE}`);
  await page.getByRole("button", { name: "Export" }).click();
  await shot(page, "13-export-menu");

  await page.goto(`/hosted-zones/${EXAMPLE}/test-record`);
  await page.getByLabel("Record name").fill("blue");
  await page.getByRole("button", { name: "Sample 20 queries" }).click();
  await expect(page.getByText("Answer distribution")).toBeVisible();
  await shot(page, "15-test-record-weighted");

  // ---- console areas
  await page.goto("/health-checks");
  await expect(page.getByRole("link", { name: "web-primary" })).toBeVisible();
  await shot(page, "20-health-checks");
  await page.getByRole("link", { name: "web-primary" }).click();
  await expect(page.getByRole("heading", { name: "web-primary", exact: true })).toBeVisible();
  await shot(page, "21-health-check-detail");

  await page.goto("/profiles");
  await expect(page.getByRole("link", { name: "production-dns" })).toBeVisible();
  await shot(page, "22-profiles");

  await page.goto("/traffic-policies");
  await page.getByRole("link", { name: "web-failover" }).click();
  await expect(page.getByRole("heading", { name: "web-failover", exact: true })).toBeVisible();
  await shot(page, "23-traffic-policy");
  await page.goto("/policy-records");
  await expect(page.getByRole("link", { name: /policy\.example\.com/ })).toBeVisible();
  await shot(page, "24-policy-records");

  await page.goto("/cidr-collections");
  await page.getByRole("link", { name: "office-networks" }).click();
  await expect(page.getByRole("heading", { name: "office-networks", exact: true })).toBeVisible();
  await shot(page, "25-cidr-collection");

  await page.goto("/registered-domains");
  await expect(page.getByRole("link", { name: "acme-corp.io" }).first()).toBeVisible();
  await shot(page, "26-registered-domains");
  await page.goto("/registered-domains/register");
  await page.getByRole("textbox", { name: "Domain name" }).fill("brightideas");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Availability", { exact: true })).toBeVisible();
  await shot(page, "27-register-domain");
  await page.goto("/domain-requests");
  await expect(page.getByRole("heading", { level: 1, name: /^Requests/ })).toBeVisible();
  await shot(page, "28-domain-requests");

  await page.goto("/resolver");
  await expect(page.getByRole("link", { name: "vpc-0a1b2c3d4e5f60789" })).toBeVisible();
  await shot(page, "29-resolver-vpcs");
  await page.goto("/resolver-rules");
  await expect(page.getByRole("link", { name: "forward-corp" })).toBeVisible();
  await shot(page, "30-resolver-rules");
  await page.goto("/dns-firewall");
  await expect(page.getByRole("link", { name: "baseline-firewall" })).toBeVisible();
  await shot(page, "31-dns-firewall");
  await page.goto("/dns-firewall-domain-lists");
  await expect(page.getByRole("link", { name: "blocked-domains" })).toBeVisible();
  await shot(page, "32-domain-lists");

  await page.goto("/hosted-zones/Z0891234KX2QWERT7HGFD?tab=dnssec");
  await expect(page.getByText("Signing", { exact: true })).toBeVisible();
  await shot(page, "33-dnssec");
  await page.goto(`/hosted-zones/${EXAMPLE}?tab=tags`);
  await expect(page.getByRole("cell", { name: "Environment" })).toBeVisible();
  await shot(page, "34-zone-tags");

  await page.goto("/billing");
  await expect(page.getByText("Estimate, not a bill")).toBeVisible();
  await shot(page, "35-billing");
  await page.goto("/activity");
  await expect(page.getByRole("heading", { level: 1, name: /^Activity/ })).toBeVisible();
  await shot(page, "36-activity");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await shot(page, "37-account");
  await page.goto("/security-credentials");
  await expect(page.getByText("This session")).toBeVisible();
  await shot(page, "38-security-credentials");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await shot(page, "39-notifications");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Services" }).click();
  await shot(page, "40-services-menu");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await shot(page, "41-help-panel");

  await page.goto(`/hosted-zones/${EXAMPLE}`);
  await page.evaluate(() => localStorage.setItem("r53-theme", "dark"));
  await page.reload();
  await expect(page.getByRole("link", { name: "example.com", exact: true }).first()).toBeVisible();
  await shot(page, "16-dark-mode");
  await page.evaluate(() => localStorage.removeItem("r53-theme"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hosted-zones");
  await expect(page.getByRole("link", { name: "acme-corp.io" })).toBeVisible();
  await shot(page, "17-mobile");
});
