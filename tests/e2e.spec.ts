import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  // fresh storage per test
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    // clear all app storage
    const keys = Object.keys(localStorage);
    for (const k of keys) localStorage.removeItem(k);
  });
  await page.close();
});

async function loginAs(page, name: "moka" | "aser" | "sila") {
  await page.goto("/");
  // Open the name modal (no password login, just name)
  await page.click("#user-indicator");
  await page.waitForSelector("#user-name", { state: "visible" });
  await page.fill("#user-name", name);
  await page.click("#login-submit");
  await expect(page.locator("#current-user")).toContainText(name);
}

async function drawAndPlace(page) {
  const overlay = page.locator(".fly-overlay");
  // If an overlay from a previous draw is still present, dismiss it first
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click().catch(() => {});
    await overlay.waitFor({ state: "detached", timeout: 2500 }).catch(() => {});
  }
  await page.locator("#draw-coupon-button").click({ timeout: 5000 });
  // If overlay appears for this draw, place it
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click().catch(() => {});
    await overlay.waitFor({ state: "detached", timeout: 2500 }).catch(() => {});
  }
}

test("threshold blocks final tile for normal until 500 points, invisible", async ({
  page,
}) => {
  await loginAs(page, "moka");
  // Prepare a specific normal reward at 7/8 and below threshold
  await page.evaluate(() => {
    const key = "rewardAlbumData:moka";
    const d = JSON.parse(localStorage.getItem(key) || "{}");
    d.points = 2000;
    d.pointsSpent = 0; // below 500
    // Ensure games array
    d.games = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      slots: Array(8).fill(false),
      completed: false,
    }));
    // Normal indices (0-based): 11,12,13; pick 11
    const idx = 11;
    d.games[idx].slots = [true, true, true, true, true, true, true, false];
    localStorage.setItem(key, JSON.stringify(d));
  });
  await page.goto(`/?t=${Date.now()}`);
  await page.waitForSelector("#album-grid");
  // Find that card and assert 7/8
  const card = page.locator(`#album-grid .game-card:nth-child(${12}) h3`);
  await expect(card).toContainText("Mystery (7/8)");
  // Try multiple draws, it should remain not Completed (final slot blocked invisibly)
  for (let i = 0; i < 20; i++) await drawAndPlace(page);
  await expect(card).not.toContainText("Completed");
});

test("hard one-time: cannot complete again after first completion", async ({
  page,
}) => {
  await loginAs(page, "aser");
  // Set a hard reward as permanently won and at 7/8; ensure cannot complete again
  await page.evaluate(() => {
    const key = "rewardAlbumData:aser";
    const d = JSON.parse(localStorage.getItem(key) || "{}");
    d.points = 5000;
    d.pointsSpent = 5000; // above any threshold
    d.games = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      slots: Array(8).fill(false),
      completed: false,
    }));
    // Hard indices (0-based): 14,15,16,17; pick 14
    const idx = 14;
    d.games[idx].slots = [true, true, true, true, true, true, true, false];
    d.permanentWins = Array.isArray(d.permanentWins) ? d.permanentWins : [];
    if (!d.permanentWins.includes(idx)) d.permanentWins.push(idx);
    localStorage.setItem(key, JSON.stringify(d));
  });
  await page.goto(`/?t=${Date.now()}`);
  await page.waitForSelector("#album-grid");
  const hardCard = page.locator(`#album-grid .game-card:nth-child(${15}) h3`);
  await expect(hardCard).toContainText("Mystery (7/8)");
  for (let i = 0; i < 20; i++) await drawAndPlace(page);
  await expect(hardCard).not.toContainText("Completed");
});
