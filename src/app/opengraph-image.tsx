import { siteConfig } from "@/config/site";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-card";

// The site-wide preview image; pages with their own opengraph-image override it.
export const alt = `${siteConfig.name}: ${siteConfig.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    label: "Placement prep",
    title: siteConfig.tagline,
    detail: "Company patterns · Mock tests · Coding judge",
    footer: { text: "For BE/BTech freshers and experienced engineers" },
  });
}
