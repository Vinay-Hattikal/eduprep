import { IMAGE_TYPES, STORED_ASSET_NAME, type ImageExtension } from "@/lib/content/assets";
import { storage } from "@/server/integrations/storage";

/**
 * Serves content images stored by imports. Names are content hashes, so responses never change
 * and can be cached forever. SVGs are sandboxed so a malicious file can't run scripts.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/assets/[file]">) {
  const { file } = await params;
  if (!STORED_ASSET_NAME.test(file)) return new Response("Not found", { status: 404 });

  const data = await storage.get(`assets/${file}`);
  if (!data) return new Response("Not found", { status: 404 });

  const extension = file.split(".").pop() as ImageExtension;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": IMAGE_TYPES[extension],
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
