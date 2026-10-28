// Images in content Markdown. Authors write ![alt](assets/file.png) and upload a ZIP with an
// assets/ folder; on import each file is stored by content hash and the link is rewritten.

export const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

export const MAX_IMAGE_BYTES = 1024 * 1024;

const ASSET_LINK = /!\[([^\]]*)\]\(assets\/([^)\s]+)\)/g;

/** File names referenced as `assets/<name>` in Markdown image links. */
export function findAssetReferences(markdown: string): string[] {
  return [...markdown.matchAll(ASSET_LINK)].map((match) => match[2]!);
}

/** Replaces `assets/<name>` image links using the given name → URL map; unknown names are left as-is. */
export function rewriteAssetLinks(markdown: string, urls: ReadonlyMap<string, string>): string {
  return markdown.replace(ASSET_LINK, (whole, alt: string, name: string) => {
    const url = urls.get(name);
    return url ? `![${alt}](${url})` : whole;
  });
}

export function imageExtension(fileName: string): ImageExtension | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && extension in IMAGE_TYPES ? (extension as ImageExtension) : null;
}

/** Public URL of a stored asset. Keys look like `<sha256>.<ext>`. */
export function assetUrl(storedName: string): string {
  return `/api/assets/${storedName}`;
}

export const STORED_ASSET_NAME = /^[a-f0-9]{64}\.(png|jpg|jpeg|webp|svg)$/;
