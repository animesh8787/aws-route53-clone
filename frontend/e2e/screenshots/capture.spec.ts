import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const OUT = path.resolve("..", "docs", "screenshots");
const EXAMPLE = "Z04512872OH7L5Q4YLRPT";

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function chooseOption(page: Page, label: string, option: RegExp | string) {
  await page.getByRole("button", { name: new RegExp(label) }).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

test("capture documentation screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await shot(page, "01-login");
  await page.getByRole("button", { name: "Fill demo credentials" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
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

  for (const [file, type, route] of [["07-create-a-record", "A", ""], ["08-create-mx-record", "MX", ""], ["09-create-srv-record", "SRV", ""], ["09b-create-caa-record", "CAA", ""]] as const) {
    void route;
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

  await page.goto("/traffic-policies");
  await expect(page.getByText("Traffic policies is coming soon")).toBeVisible();
  await shot(page, "14-coming-soon");

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
