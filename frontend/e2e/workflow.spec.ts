import { expect, test, type Page } from "@playwright/test";

const ZONE = "e2e-test.com";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo credentials" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
}

async function chooseOption(page: Page, selectLabel: string, option: RegExp | string) {
  await page.getByRole("main").getByRole("button", { name: new RegExp(selectLabel) }).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

async function openZone(page: Page, name: string) {
  await page.goto("/hosted-zones");
  await page.getByLabel("Filter hosted zones").fill(name);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function createRecord(page: Page, fill: () => Promise<void>) {
  await page.getByRole("button", { name: "Create record" }).first().click();
  await expect(page.getByRole("heading", { name: "Create record", exact: true })).toBeVisible();
  await fill();
  await page.getByRole("button", { name: "Create record" }).last().click();
  await expect(page.getByText(/was created successfully/)).toBeVisible();
}

test("full Route 53 workflow with persistence across sessions", async ({ page }) => {
  await login(page);

  // ---- hosted zones: search / filter / pagination
  await page.getByRole("link", { name: "Hosted zones" }).first().click();
  await expect(page.getByRole("heading", { name: /Hosted zones/ })).toBeVisible();
  const search = page.getByLabel("Filter hosted zones");
  await search.fill("mycompany");
  await expect(page.getByRole("link", { name: "mycompany.dev", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "example.com", exact: true })).toHaveCount(0);
  await search.fill("");
  await chooseOption(page, "Filter by hosted zone type", /Private hosted zones/);
  await expect(page.getByRole("link", { name: "internal.local", exact: true })).toBeVisible();
  await chooseOption(page, "Filter by hosted zone type", /All types/);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);

  // ---- create the zone
  await page.goto("/hosted-zones/create");
  await page.getByLabel("Domain name").fill("not a domain");
  await page.getByRole("button", { name: "Create hosted zone" }).last().click();
  await expect(page.getByText(/at least two labels/).first()).toBeVisible();
  await page.getByLabel("Domain name").fill(ZONE);
  await page.getByLabel(/Description/).fill("created by Playwright");
  await page.getByRole("button", { name: "Create hosted zone" }).last().click();
  await expect(page.getByText(`Hosted zone ${ZONE} was successfully created.`)).toBeVisible();
  await expect(page.getByRole("heading", { name: ZONE })).toBeVisible();

  // ---- system records
  await expect(page.getByRole("row", { name: /NS/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /SOA/ }).first()).toBeVisible();

  // ---- A record
  await createRecord(page, async () => {
    await page.getByLabel("Record name").fill("www");
    await page.getByLabel(/^Value/).fill("192.0.2.10");
  });
  await expect(page.getByRole("link", { name: `www.${ZONE}` })).toBeVisible();

  // ---- CNAME
  await createRecord(page, async () => {
    await page.getByLabel("Record name").fill("blog");
    await chooseOption(page, "Record type", /^CNAME/);
    await page.getByLabel(/^Value/).fill(`www.${ZONE}`);
  });

  // ---- MX
  await createRecord(page, async () => {
    await chooseOption(page, "Record type", /^MX/);
    await page.getByRole("textbox", { name: "Mail server 1" }).fill(`mail.${ZONE}`);
  });

  // ---- TXT
  await createRecord(page, async () => {
    await page.getByLabel("Record name").fill("_verify");
    await chooseOption(page, "Record type", /^TXT/);
    await page.getByLabel(/^Value/).fill("hello world");
  });

  // ---- validation error is shown and nothing is saved
  await page.getByRole("button", { name: "Create record" }).first().click();
  await page.getByLabel("Record name").fill("bad");
  await page.getByLabel(/^Value/).fill("999.1.1.1");
  await page.getByRole("button", { name: "Create record" }).last().click();
  await expect(page.getByText(/not a valid IPv4 address/).first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // ---- edit
  await page.getByRole("link", { name: `www.${ZONE}` }).click();
  await expect(page.getByRole("heading", { name: "Edit record", exact: true })).toBeVisible();
  await page.getByLabel("TTL in seconds").fill("120");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/was updated successfully/)).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`www.${ZONE}.*120`) })).toBeVisible();

  // ---- search + filter records
  const recordSearch = page.getByPlaceholder("Filter records by name, type or value");
  await recordSearch.fill("blog");
  await expect(page.getByRole("link", { name: `blog.${ZONE}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `www.${ZONE}` })).toHaveCount(0);
  await recordSearch.fill("");
  await chooseOption(page, "Filter by record type", /^MX/);
  await expect(page.getByRole("row", { name: /MX/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: `www.${ZONE}` })).toHaveCount(0);
  await chooseOption(page, "Filter by record type", /All types/);

  // ---- delete a record with confirmation
  await page.getByRole("checkbox", { name: new RegExp(`Select blog.${ZONE}`) }).check();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByRole("dialog")).toContainText(`blog.${ZONE}`);
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("1 record deleted successfully.")).toBeVisible();
  await expect(page.getByRole("link", { name: `blog.${ZONE}` })).toHaveCount(0);

  // ---- logout / login: data persists
  await page.getByRole("button", { name: /demo-user/ }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/hosted-zones");
  await expect(page).toHaveURL(/\/login/);
  await login(page);
  await openZone(page, ZONE);
  await expect(page.getByRole("link", { name: `www.${ZONE}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `blog.${ZONE}` })).toHaveCount(0);

  // ---- delete the zone (has records, so it needs the explicit acknowledgement)
  await page.getByRole("button", { name: "Delete zone" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Hosted zone ${ZONE} was deleted.`)).toBeVisible();
  await expect(page).toHaveURL(/\/hosted-zones$/);
});

test("BIND import preview, export and DNS test record", async ({ page }) => {
  await login(page);
  await openZone(page, "shop.example.com");
  await page.getByRole("button", { name: "Import zone file" }).click();
  await page.getByRole("button", { name: "Use sample zone file" }).click();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText(/valid, \d+ with errors/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Export as BIND zone file" }).click();
  expect((await exportPromise).suggestedFilename()).toBe("shop.example.com.zone");

  await page.getByRole("button", { name: "Test record" }).click();
  await page.getByLabel("Record name").fill("checkout");
  await page.getByRole("button", { name: "Get response" }).click();
  await expect(page.getByText("NOERROR")).toBeVisible();
});

test("unauthenticated users are redirected and every console page renders", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/hosted-zones");
  await expect(page).toHaveURL(/\/login/);
  await login(page);
  const routes: [string, RegExp][] = [
    ["/dashboard", /Route 53 Dashboard/], ["/home", /Amazon Route 53/], ["/hosted-zones", /^Hosted zones/], ["/health-checks", /^Health checks/], ["/profiles", /^Profiles/],
    ["/cidr-collections", /^CIDR collections/], ["/traffic-policies", /^Traffic policies/], ["/policy-records", /^Policy records/],
    ["/registered-domains", /^Registered domains/], ["/domain-requests", /^Requests/], ["/resolver", /^VPCs/], ["/resolver-inbound", /^Inbound endpoints/],
    ["/resolver-outbound", /^Outbound endpoints/], ["/resolver-rules", /^Rules/], ["/resolver-query-logging", /^Query logging/],
    ["/dns-firewall", /^Rule groups/], ["/dns-firewall-domain-lists", /^Domain lists/], ["/shared-dns-views", /^Shared DNS views/],
    ["/resolver-outposts", /^Resolver on Outpost/], ["/billing", /^Billing and Cost Management/], ["/activity", /^Activity/],
  ];
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  }
  await page.goto("/not-a-real-page");
  await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
});

test("every record type, alias and weighted routing can be created through the editor", async ({ page }) => {
  const zone = "types-test.com";
  await login(page);
  await page.goto("/hosted-zones/create");
  await page.getByLabel("Domain name").fill(zone);
  await page.getByRole("button", { name: "Create hosted zone" }).last().click();
  await expect(page.getByText(`Hosted zone ${zone} was successfully created.`)).toBeVisible();
  await expect(page).toHaveURL(/\/hosted-zones\/Z[A-Z0-9]+$/);
  const zoneUrl = page.url();

  const record = async (fill: () => Promise<void>) => {
    await page.goto(`${zoneUrl}/records/create`);
    await expect(page.getByRole("heading", { name: "Create record", exact: true })).toBeVisible();
    await fill();
    await page.getByRole("button", { name: "Create record" }).last().click();
    await expect(page.getByText(/was created successfully/).first()).toBeVisible();
  };
  const type = (t: string) => chooseOption(page, "Record type", new RegExp(`^${t}`));
  const name = (n: string) => page.getByLabel("Record name").fill(n);
  const lines = (v: string) => page.getByLabel(/^Value/).fill(v);

  await record(async () => { await name("v6"); await type("AAAA"); await lines("2001:db8::1"); });
  await record(async () => { await name("child"); await type("NS"); await lines("ns1.example.net\nns2.example.net"); });
  await record(async () => { await name("ptr"); await type("PTR"); await lines("host.example.net"); });
  await record(async () => {
    await name("_sip._tcp");
    await type("SRV");
    await page.getByRole("textbox", { name: "Port 1" }).fill("5060");
    await page.getByRole("textbox", { name: "Target 1" }).fill("sip.example.net");
  });
  await record(async () => {
    await type("CAA");
    await page.getByRole("textbox", { name: "Value 1", exact: true }).fill("letsencrypt.org");
  });
  await record(async () => {
    await name("cdn");
    await page.getByText("Alias", { exact: true }).first().click();
    await page.getByRole("textbox", { name: "Alias target" }).fill("d111111abcdef8.cloudfront.net");
  });
  await record(async () => {
    await name("w");
    await lines("192.0.2.1");
    await chooseOption(page, "Routing policy", /^Weighted/);
    await page.getByLabel("Record ID").fill("one");
  });

  // all of them are listed, with the right types
  await page.goto(zoneUrl);
  for (const host of ["v6", "child", "ptr", "_sip._tcp", "cdn", "w"]) {
    await expect(page.getByRole("link", { name: `${host}.${zone}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Records (9)" })).toBeVisible();
  await expect(page.getByRole("row", { name: /cdn.types-test.com.*Yes/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /w.types-test.com.*Weight: 100/ })).toBeVisible();

  // clean up
  await page.getByRole("button", { name: "Delete zone" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByPlaceholder("delete").fill("delete");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Hosted zone ${zone} was deleted.`)).toBeVisible();
});
