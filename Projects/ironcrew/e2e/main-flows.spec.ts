import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

test("a signed-out visit to the dashboard lands on the login page", async ({ page }) => {
  test.skip(!hasSupabase, "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});

test("a wrong password stays on the login form", async ({ page }) => {
  test.skip(!hasSupabase, "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  await signIn(page, "nobody@example.com", "not-the-password");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.locator("p.text-red-500")).toBeVisible();
});

test("a trainer signs in to the clients and programs dashboard", async ({ page }) => {
  test.skip(
    !hasSupabase || !process.env.E2E_TRAINER_EMAIL || !process.env.E2E_TRAINER_PASSWORD,
    "Set E2E_TRAINER_EMAIL and E2E_TRAINER_PASSWORD",
  );
  await signIn(page, process.env.E2E_TRAINER_EMAIL!, process.env.E2E_TRAINER_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Clients" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Programs" })).toBeVisible();
});

test("a client signs in to this week's workouts", async ({ page }) => {
  test.skip(
    !hasSupabase || !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_CLIENT_PASSWORD,
    "Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD",
  );
  await signIn(page, process.env.E2E_CLIENT_EMAIL!, process.env.E2E_CLIENT_PASSWORD!);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("This week")).toBeVisible();
});

test("a new trainer finishes onboarding and reaches the dashboard", async ({ page }) => {
  test.skip(
    !hasSupabase || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Set SUPABASE_SERVICE_ROLE_KEY to create a throwaway onboarding user",
  );

  const admin = createClient(supabaseUrl!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `e2e-${Date.now()}@example.com`;
  const password = `E2e-${Date.now()}-pass`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Could not create the onboarding user");
  }

  try {
    await signIn(page, email, password);
    await expect(page.getByRole("heading", { name: "Welcome to SEMA" })).toBeVisible();
    await page.getByRole("radio", { name: /Trainer/ }).click();
    await page.getByLabel("First name").fill("E2E");
    await page.locator("#terms-agreement").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your coaching business" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Add your first client" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Start your program library" })).toBeVisible();
    await page.getByRole("button", { name: "Finish later" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("button", { name: "Clients" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(created.data.user.id);
  }
});
