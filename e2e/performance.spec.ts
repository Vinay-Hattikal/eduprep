import { expect, test, type Page } from "@playwright/test";

// Performance budget (6.11, D-062): the public pages search engines and shared links land on
// must stay fast. Measured on the production build the e2e server runs, so the numbers are a
// floor: real phones on 4G are slower. Raise a budget only with a reason in progress.md.

const PAGES = [
  "/",
  "/companies",
  "/companies/acme-tech",
  "/questions",
  "/question/qa-pct-0001",
  "/problems/pair-with-target-sum",
  "/mock-tests/acme-tech-mock",
  "/jobs",
];

const BUDGET = {
  /** Largest Contentful Paint, ms ("good" is under 2.5 s). */
  lcp: 2_500,
  /** Cumulative Layout Shift ("good" is under 0.1). */
  cls: 0.1,
  /** JavaScript sent over the wire, compressed, KB. */
  scriptKb: 450,
  /** Everything sent over the wire, compressed, KB. */
  totalKb: 900,
};

type Metrics = { lcp: number; cls: number; scriptKb: number; totalKb: number };

async function measure(page: Page, path: string): Promise<Metrics> {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0;
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!entry.hadRecentInput) w.__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const bytes = (list: PerformanceResourceTiming[]) =>
      list.reduce((n, r) => n + (r.encodedBodySize || r.transferSize), 0);
    const scripts = resources.filter(
      (r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name),
    );
    return {
      lcp: Math.round(w.__lcp),
      cls: Math.round(w.__cls * 1000) / 1000,
      scriptKb: Math.round(bytes(scripts) / 1024),
      totalKb: Math.round((bytes(resources) + nav.encodedBodySize) / 1024),
    };
  });
}

test("public pages stay within the performance budget", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Measured once");
  test.setTimeout(120_000);
  const results: Record<string, Metrics> = {};
  for (const path of PAGES) {
    // A fresh context per page: nothing cached from the page before, like a first visit.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(path); // warm the server's cache; the budget is for the page, not a cold start
    await context.clearCookies();
    await context.close();

    const fresh = await browser.newContext();
    results[path] = await measure(await fresh.newPage(), path);
    await fresh.close();
  }
  testInfo.annotations.push({ type: "performance", description: JSON.stringify(results) });
  console.log(JSON.stringify(results, null, 1));

  for (const [path, m] of Object.entries(results)) {
    expect.soft(m.lcp, `LCP on ${path}`).toBeLessThanOrEqual(BUDGET.lcp);
    expect.soft(m.cls, `CLS on ${path}`).toBeLessThanOrEqual(BUDGET.cls);
    expect.soft(m.scriptKb, `JavaScript on ${path}`).toBeLessThanOrEqual(BUDGET.scriptKb);
    expect.soft(m.totalKb, `Page weight of ${path}`).toBeLessThanOrEqual(BUDGET.totalKb);
  }
});
