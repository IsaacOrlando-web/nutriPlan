// Demo flow e2e (spec section 3). Owner: Lead.
// Runs unchanged on mocks (NEXT_PUBLIC_USE_MOCKS=true), on the memory backend (default) and against a live URL
// (E2E_BASE_URL). Login always goes through the UI so the spec never depends on cookies or localStorage.
// Test ids are frozen in /app/CLAUDE.md; counts use >= where the data may vary.
import { expect, test, type Locator, type Page } from "@playwright/test";

const NAV_TIMEOUT = 30_000;
const AGENT_ROOM_TIMEOUT = 90_000;
/** The dashboard is the app root. */
const DASHBOARD = "/";

/** Lands on the dashboard as the given demo user via /welcome. Handles onboarding or an Agent Room detour. */
async function loginAs(page: Page, user: "alex" | "maria"): Promise<void> {
  await page.goto("/welcome");
  await page.getByTestId(user === "alex" ? "cta-start" : "cta-maria").click();
  await page.waitForURL((url) => /^\/(dashboard|onboarding|agents\/.*)?$/.test(url.pathname), {
    timeout: NAV_TIMEOUT,
  });

  if (/\/onboarding/.test(page.url())) {
    const skip = page.getByTestId("onboarding-skip");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    const rulesContinue = page.getByTestId("rules-continue");
    if (await rulesContinue.isVisible({ timeout: 5_000 }).catch(() => false)) await rulesContinue.click();
  }
  if (/\/agents\//.test(page.url())) {
    await expect(page.getByTestId("plan-ready")).toBeVisible({ timeout: AGENT_ROOM_TIMEOUT });
    await page.goto(DASHBOARD);
  }
  await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: NAV_TIMEOUT });
}

/** Clicks the first match if it shows up within `timeout`. Returns true when clicked. */
async function clickIfVisible(locator: Locator, timeout = 3_000): Promise<boolean> {
  const visible = await locator
    .first()
    .isVisible({ timeout })
    .catch(() => false);
  if (visible) await locator.first().click();
  return visible;
}

test.describe("NutriPlan demo flow", () => {
  test("Alex: welcome -> dashboard -> plan -> why sheet -> grocery", async ({ page }) => {
    await loginAs(page, "alex");
    await expect(page.getByTestId("calorie-ring")).toBeVisible({ timeout: NAV_TIMEOUT });

    await page.getByTestId("nav-plan").first().click();
    await page.waitForURL(/\/plan/, { timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("plan-screen")).toBeVisible();
    await expect(page.getByTestId("plan-day")).toHaveCount(7, { timeout: NAV_TIMEOUT });

    // 3 meals a day for Alex. The plan screen renders one day at a time, so sum across the 7 day tabs.
    const mealCards = page.getByTestId("meal-card");
    await expect(mealCards.first()).toBeVisible();
    let total = await mealCards.count();
    if (total < 21) {
      const days = page.getByTestId("plan-day");
      total = 0;
      for (let i = 0; i < 7; i++) {
        await days.nth(i).click();
        await expect(mealCards.first()).toBeVisible();
        total += await mealCards.count();
      }
    }
    expect(total).toBeGreaterThanOrEqual(21);

    await mealCards.first().click();
    await expect(page.getByTestId("why-sheet")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("weekly-cost")).toBeVisible();

    await page.goto("/grocery");
    await expect(page.getByTestId("grocery-list")).toBeVisible({ timeout: NAV_TIMEOUT });
    expect(await page.getByTestId("grocery-item").count()).toBeGreaterThan(0);
  });

  test("Agent Room: budget change triggers a negotiation with objection and concession", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, "alex");
    await page.goto("/plan");
    await expect(page.getByTestId("plan-screen")).toBeVisible({ timeout: NAV_TIMEOUT });

    // Radix slider root carries the test id; the thumb is role=slider. Keyboard steps fire onValueCommit.
    const slider = page.getByTestId("budget-slider");
    await expect(slider).toBeVisible();
    const thumb = slider.getByRole("slider");
    const target = (await thumb.count()) > 0 ? thumb.first() : slider;
    await target.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
    // Some implementations commit on blur or behind an explicit button.
    await page.keyboard.press("Tab");
    await clickIfVisible(page.getByRole("button", { name: /replan|renegotiate|update plan|apply/i }), 2_000);

    await page.waitForURL(/\/agents\//, { timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("agent-room")).toBeVisible();
    await expect(page.getByTestId("constraint-strip")).toBeVisible({ timeout: NAV_TIMEOUT });

    await expect(page.locator('[data-testid="agent-event"][data-kind="objection"]').first()).toBeVisible({
      timeout: AGENT_ROOM_TIMEOUT,
    });
    await expect(page.locator('[data-testid="agent-event"][data-kind="concession"]').first()).toBeVisible({
      timeout: AGENT_ROOM_TIMEOUT,
    });
    await expect(page.getByTestId("plan-ready")).toBeVisible({ timeout: AGENT_ROOM_TIMEOUT });

    const events = page.getByTestId("agent-event");
    expect(await events.count()).toBeGreaterThanOrEqual(5);
    const agents = await events.evaluateAll((els) => els.map((e) => e.getAttribute("data-agent")));
    expect(
      agents.every((a) => ["doctor", "chef", "budget", "monitor", "orchestrator"].includes(a ?? "")),
    ).toBe(true);
  });

  test("Reading: logging a weight returns a Monitor result", async ({ page }) => {
    await loginAs(page, "alex");
    await page.goto("/log/reading");
    await expect(page.getByTestId("reading-value")).toBeVisible({ timeout: NAV_TIMEOUT });

    // reading-type is a native <select>; keep fallbacks for a Radix select or per type buttons.
    const byButton = page.getByTestId("reading-type-weight");
    if (await byButton.isVisible().catch(() => false)) {
      await byButton.click();
    } else {
      const type = page.getByTestId("reading-type");
      if (await type.isVisible().catch(() => false)) {
        const tag = await type.evaluate((el) => el.tagName.toLowerCase());
        if (tag === "select") {
          await type.selectOption("weight");
        } else {
          await type.click();
          await clickIfVisible(page.getByRole("option", { name: /weight|peso/i }));
        }
      }
    }

    await page.getByTestId("reading-value").fill("89.2");
    await page.getByTestId("reading-submit").click();
    await expect(page.getByTestId("monitor-result")).toBeVisible({ timeout: NAV_TIMEOUT });
  });

  test("Trends: chart and alert are visible for Alex", async ({ page }) => {
    await loginAs(page, "alex");
    await page.goto("/trends");
    await clickIfVisible(page.getByTestId("trend-tab-weight"));
    await expect(page.getByTestId("trend-chart").first()).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("trend-alert").first()).toBeVisible({ timeout: NAV_TIMEOUT });
  });

  test("Maria: glucose trend shows a rising alert", async ({ page }) => {
    await loginAs(page, "maria");
    await page.goto("/trends");
    const glucoseTab = page
      .getByTestId("trend-tab-glucose")
      .or(page.getByTestId("trend-tab-glucose_fasting"))
      .or(page.getByRole("tab", { name: /glucose|glucosa/i }));
    await clickIfVisible(glucoseTab);
    await expect(page.getByTestId("trend-chart").first()).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("trend-alert").first()).toContainText(
      /rising|subiendo|al alza|en aumento/i,
      {
        timeout: NAV_TIMEOUT,
      },
    );
  });

  test("Spanish: language switch translates the dashboard", async ({ page }) => {
    await loginAs(page, "alex");
    await page.goto("/profile");
    await expect(page.getByTestId("profile-screen")).toBeVisible({ timeout: NAV_TIMEOUT });

    // lang-switch is a button group with lang-en / lang-es; keep fallbacks for a select or a toggle.
    const sw = page.getByTestId("lang-switch");
    await expect(sw).toBeVisible();
    if (!(await clickIfVisible(page.getByTestId("lang-es"), 2_000))) {
      const tag = await sw.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") {
        await sw.selectOption("es");
      } else {
        await sw.click();
        await clickIfVisible(page.getByRole("option", { name: /espa[nñ]ol|^es$/i }), 1_500);
        await clickIfVisible(page.getByRole("menuitem", { name: /espa[nñ]ol|^es$/i }), 1_500);
      }
    }

    await page.goto(DASHBOARD);
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("dashboard")).toContainText(
      /Hoy|Panel|Calor[ií]as|Comida|Restante|Objetivo|Hola/i,
      {
        timeout: NAV_TIMEOUT,
      },
    );
  });
});
