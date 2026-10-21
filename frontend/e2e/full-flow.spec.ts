import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The complete user journey against the real stack, using synthetic demo data only.
 * Each test.step is one of the 16 acceptance steps listed in docs/VERIFICATION.md.
 */
const DEMO = path.resolve(import.meta.dirname, "../../demo-data");
const SHOTS = process.env.SCREENSHOTS_DIR;
const PASSWORD = "E2e-synthetic-2026";
const stamp = Date.now();
const userA = { name: "Ananya Rao", email: `e2e.a.${stamp}@example.com` };
const userB = { name: "Second User", email: `e2e.b.${stamp}@example.com` };

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
}

async function register(page: Page, who: { name: string; email: string }) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/confirm/i).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

async function deleteAccount(page: Page) {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Delete account" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("Your account has been deleted")).toBeVisible();
}

test("full journey: register → analyse → save → export → isolation", async ({ page, browser }) => {
  let comparisonUrl = "";
  const renamed = `Northwind backend – E2E ${stamp}`;

  await test.step("1. Register a new account", async () => {
    await register(page, userA);
    await expect(page.getByRole("heading", { name: /Good to see you, Ananya/ })).toBeVisible();
    await expect(page.getByText("No saved comparisons yet")).toBeVisible();
    await shot(page, "dashboard-empty");
  });

  await test.step("2. Sign out and sign back in", async () => {
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/app/resumes");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fresumes$/);
    await page.getByLabel("Email").fill(userA.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app\/resumes$/);
  });

  await test.step("3. Reject a non-PDF disguised as a PDF", async () => {
    await page.locator("#resume-file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not really a pdf file") });
    await page.getByRole("button", { name: /^Upload/ }).click();
    await expect(page.getByText("Upload not accepted")).toBeVisible();
  });

  await test.step("4. Upload a text-based PDF resume", async () => {
    await page.locator("#resume-file").setInputFiles(path.join(DEMO, "resume-ananya-rao.pdf"));
    await shot(page, "resume-upload");
    await page.getByRole("button", { name: /^Upload/ }).click();
    await expect(page).toHaveURL(/\/app\/resumes\/[0-9a-f-]+\?new=1$/);
    await expect(page.getByText("Check the text before analysing")).toBeVisible();
    await expect(page.getByLabel("Resume text")).toHaveValue(/Ananya Rao/);
  });

  await test.step("5. Review and edit the extracted text", async () => {
    await expect(page.getByRole("heading", { name: "Detected sections" })).toBeVisible();
    const text = page.getByLabel("Resume text");
    await text.press("End");
    await text.pressSequentially("\nVolunteer: Taught Git basics to first-year students.");
    await page.getByLabel("Title").fill("Ananya Rao – backend");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Resume saved.")).toBeVisible();
    await shot(page, "resume-review");
  });

  await test.step("6. Start an analysis from the resume and paste a job description", async () => {
    await page.getByRole("button", { name: /Analyse against a job/ }).click();
    await expect(page).toHaveURL(/\/app\/analyze\?resume=/);
    await page.getByLabel("Company").fill("Northwind Labs");
    await page.getByRole("textbox", { name: "Job description" }).fill(readFileSync(path.join(DEMO, "job-java-backend-intern.txt"), "utf8"));
    await shot(page, "job-description");
  });

  await test.step("7. Extract requirements", async () => {
    await page.getByRole("button", { name: "Extract requirements" }).click();
    await expect(page.getByRole("heading", { name: "Check the extracted skill requirements" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Java" })).toBeVisible();
  });

  await test.step("8. Edit the extracted requirements", async () => {
    await page.getByRole("button", { name: "Remove Agile" }).click();
    await expect(page.getByRole("button", { name: "Remove Agile" })).toHaveCount(0);
    await page.getByRole("group", { name: "Importance of Docker" }).getByRole("button", { name: "Required" }).click();
    await page.getByLabel("Skill name").fill("GraphQL");
    await page.getByLabel("Importance", { exact: true }).selectOption("preferred");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove GraphQL" })).toBeVisible();
    await shot(page, "requirements", true);
  });

  await test.step("9. Run the analysis", async () => {
    await page.getByRole("button", { name: "Run analysis" }).click();
    await expect(page).toHaveURL(/\/app\/comparisons\/[0-9a-f-]+\?fresh=1$/, { timeout: 60_000 });
    comparisonUrl = page.url().split("?")[0]!;
  });

  await test.step("10. Review explainable results", async () => {
    await expect(page.getByRole("img", { name: /Alignment score: \d+ out of 100/ })).toBeVisible();
    await expect(page.getByText(/not a probability of being interviewed or hired/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "How the score was calculated" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GraphQL", level: 4, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agile", level: 4, exact: true })).toHaveCount(0);
    await expect(page.getByText("Ideas for future work — not yet done").first()).toBeVisible();
    await shot(page, "results");
    await shot(page, "results-full", true);
  });

  await test.step("11. Save and rename the comparison", async () => {
    await page.getByRole("button", { name: "Save comparison" }).click();
    await expect(page.getByText("Saved comparison", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
  });

  await test.step("12. Download the PDF report", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF report" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  await test.step("13. Export JSON", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export JSON" }).click()]);
    const json = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(JSON.stringify(json)).toContain(renamed);
    expect(JSON.stringify(json)).toContain("GraphQL");
  });

  await test.step("14. Find it in saved comparisons with search, filters and sort", async () => {
    await page.getByRole("link", { name: "Saved comparisons" }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();
    await page.getByLabel("Search by name, job title or company").fill("no-such-comparison-xyz");
    await expect(page.getByText("No comparisons match these filters")).toBeVisible();
    await page.getByLabel("Search by name, job title or company").fill("Northwind");
    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();
    await expect(page).toHaveURL(/q=Northwind/);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    // The demo pair scores in the 60s, so a 90+ filter must exclude it (verified server-side via minScore).
    await page.getByLabel("Min score").fill("90");
    await page.getByLabel("Min score").blur();
    await expect(page).toHaveURL(/minScore=90/);
    await expect(page.getByText("No comparisons match these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByLabel("Sort").selectOption("overallScore,desc");
    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();
    await shot(page, "comparisons");
  });

  await test.step("15. Dashboard reflects the saved comparison", async () => {
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText("Saved comparisons").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Frequently missing required skills" })).toBeVisible();
    await expect(page.getByText(renamed).first()).toBeVisible();
    await shot(page, "dashboard", true);
  });

  await test.step("16. Another user cannot see or fetch this comparison", async () => {
    const other = await browser.newContext();
    const pageB = await other.newPage();
    await register(pageB, userB);
    await pageB.goto(comparisonUrl);
    await expect(pageB.getByText("Comparison not found")).toBeVisible();
    const id = comparisonUrl.split("/").pop();
    const api = await pageB.request.get(`/api/v1/comparisons/${id}`);
    expect(api.status()).toBe(404);
    const pdf = await pageB.request.get(`/api/v1/comparisons/${id}/report.pdf`);
    expect(pdf.status()).toBe(404);
    await pageB.goto("/app/comparisons");
    await expect(pageB.getByText("Nothing saved yet")).toBeVisible();
    await deleteAccount(pageB);
    await other.close();
  });

  await test.step("Clean up: delete the account and its data", async () => {
    await shot(page, "settings", true);
    await deleteAccount(page);
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
