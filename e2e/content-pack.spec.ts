import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { accounts, signInAs } from "./helpers";

// Content packs (D-061): upload a ZIP of a content folder and watch it import.
test("an admin uploads a content pack and sees each file's result", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Covered once");
  test.setTimeout(90_000);
  const taxonomy = new Uint8Array(await readFile(path.resolve("docs/templates/taxonomy.csv")));
  const zip = zipSync({ "content/00-taxonomy/taxonomy.csv": taxonomy });

  await signInAs(page, accounts.admin, "/admin/imports");
  const form = page.getByRole("form", { name: "Content pack" });
  await form.getByLabel("ZIP file").setInputFiles({
    name: "e2e-pack.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await page.getByTestId("upload-pack").click();

  await expect(page).toHaveURL(/\/admin\/imports\/packs\//);
  await expect(page.getByRole("heading", { level: 1, name: "e2e-pack.zip" })).toBeVisible();
  // The worker imports it; the page refreshes itself until it's done.
  await expect(page.getByRole("link", { name: "00-taxonomy/taxonomy.csv" })).toBeVisible({
    timeout: 60_000,
  });
});
