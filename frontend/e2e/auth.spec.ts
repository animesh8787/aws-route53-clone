import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Correct-horse-42";
const unique = () => `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.org`;

async function signUp(page: Page, email: string, name = "E2E User") {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Display name" }).fill(name);
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(PASSWORD);
  await passwords.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
}

async function signOut(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("sign up validates the password, starts empty, and can load sample data", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email address" }).fill("not-an-email");
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("short");
  await expect(page.getByRole("list", { name: "Password requirements" })).toContainText("At least 10 characters");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("The password does not meet every requirement.")).toBeVisible();
  await page.getByRole("textbox", { name: "Email address" }).fill(unique());
  await passwords.nth(0).fill(PASSWORD);
  await passwords.nth(1).fill("different-Pass-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();

  await signUp(page, unique());
  await page.goto("/hosted-zones");
  await expect(page.getByText("No hosted zones", { exact: true })).toBeVisible();
  await page.goto("/health-checks");
  await expect(page.getByText("No health checks", { exact: true })).toBeVisible();

  // another account's zone is not reachable by its URL
  await page.goto("/hosted-zones/Z04512872OH7L5Q4YLRPT");
  await expect(page.getByText("Hosted zone not found.")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText("This account is empty.")).toBeVisible();
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText("Sample data was loaded.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Hosted zones.*22/ })).toBeVisible();
  await page.getByPlaceholder(/Filter hosted zones/).fill("example.com");
  await expect(page.getByRole("link", { name: "example.com", exact: true })).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByRole("dialog").getByPlaceholder("delete").fill("delete");
  await page.getByRole("dialog").getByRole("button", { name: "Clear data" }).click();
  await expect(page.getByText("All data was removed from your account.")).toBeVisible();
  await expect(page.getByText("This account is empty.")).toBeVisible();
});

test("password change signs out other sessions and the new password works", async ({ browser, page }) => {
  const email = unique();
  await signUp(page, email);

  // a second browser session for the same account
  const other = await browser.newPage();
  await signIn(other, email, PASSWORD);
  await expect(other.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();

  await page.goto("/security-credentials");
  await expect(page.getByText("This session")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Active sessions.*2/ })).toBeVisible();

  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("wrong-current-1");
  await passwords.nth(1).fill("Brand-new-pass-77");
  await passwords.nth(2).fill("Brand-new-pass-77");
  await page.getByRole("button", { name: "Change password" }).last().click();
  await expect(page.getByText("The current password is incorrect.")).toBeVisible();
  await passwords.nth(0).fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).last().click();
  await expect(page.getByText("Password changed. Your other sessions were signed out.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Active sessions.*1/ })).toBeVisible();

  await other.goto("/hosted-zones");
  await expect(other).toHaveURL(/\/login/);
  await other.close();

  await signOut(page, "E2E User");
  await signIn(page, email, PASSWORD);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await signIn(page, email, "Brand-new-pass-77");
  await expect(page.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();
});

test("repeated failed sign-ins lock the account", async ({ page }) => {
  const email = unique();
  await signUp(page, email);
  await signOut(page, "E2E User");
  for (let i = 0; i < 5; i++) {
    await signIn(page, email, `wrong-password-${i}`);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  await signIn(page, email, PASSWORD);
  await expect(page.getByText(/Too many failed sign-in attempts/)).toBeVisible();
  await expect(page.getByText("Too many attempts", { exact: true })).toBeVisible();
});

test("a signed-in user can end other sessions and the profile can be renamed", async ({ browser, page }) => {
  const email = unique();
  await signUp(page, email, "Original Name");
  const other = await browser.newPage();
  await signIn(other, email, PASSWORD);
  await expect(other.getByRole("heading", { name: "Route 53 dashboard" })).toBeVisible();

  await page.goto("/security-credentials");
  await page.getByRole("button", { name: "Sign out all other sessions" }).click();
  await expect(page.getByText(/Signed out of 1 other session/)).toBeVisible();
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login/);
  await other.close();

  await page.goto("/account");
  await page.getByRole("textbox", { name: "Display name" }).fill("Renamed User");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Your display name was updated.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Renamed User/ })).toBeVisible();
});
