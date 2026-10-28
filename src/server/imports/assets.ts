// Stores images referenced from imported Markdown and rewrites their links (data-import.md 4.3).

import { createHash } from "node:crypto";
import { assetUrl, findAssetReferences, imageExtension } from "@/lib/content/assets";
import type { CellReader } from "@/server/imports/cells";
import { storage } from "@/server/integrations/storage";

/** Content-addressed name per uploaded asset: identical images are stored once. */
export function hashAssets(assets: Map<string, Uint8Array>): Map<string, string> {
  const names = new Map<string, string>();
  for (const [name, bytes] of assets) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    names.set(name, `${hash}.${imageExtension(name)}`);
  }
  return names;
}

/** URL for each asset name, for rewriting Markdown links. */
export function assetUrls(storedNames: Map<string, string>): Map<string, string> {
  return new Map([...storedNames].map(([name, stored]) => [name, assetUrl(stored)]));
}

/** Errors when a cell links to an image that isn't in the upload. */
export function checkAssetReferences(
  reader: CellReader,
  column: string,
  markdown: string | undefined,
  available: Map<string, unknown>,
) {
  if (!markdown) return;
  for (const name of findAssetReferences(markdown)) {
    if (!available.has(name)) {
      reader.error(
        column,
        available.size === 0
          ? `Links to assets/${name}, but images need a ZIP upload with an assets/ folder.`
          : `assets/${name} is not in the ZIP.`,
      );
    }
  }
}

/** Saves the given assets (by original name) to storage under assets/<hash>.<ext>. */
export async function storeAssets(
  names: Iterable<string>,
  assets: Map<string, Uint8Array>,
  storedNames: Map<string, string>,
): Promise<void> {
  for (const name of new Set(names)) {
    const bytes = assets.get(name);
    const stored = storedNames.get(name);
    if (bytes && stored) await storage.put(`assets/${stored}`, bytes);
  }
}
