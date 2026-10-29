import { expect, test } from "@playwright/test";

// Social sharing previews (D-062): public pages name a generated 1200×630 PNG as og:image.

const PAGES = [
  "/",
  "/question/qa-pct-0001",
  "/problems/pair-with-target-sum",
  "/companies/acme-tech",
  "/mock-tests/acme-tech-mock",
];

test("public pages carry a preview image that renders", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  test.setTimeout(90_000);
  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(image, `og:image on ${path}`).toBeTruthy();
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');

    const response = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(response.status(), `image for ${path}`).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect((await response.body()).length).toBeGreaterThan(5_000);
  }
});

test("a missing page's preview image is a 404", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Same on every device");
  const response = await request.get("/problems/no-such-problem/opengraph-image");
  expect(response.status()).toBe(404);
});
