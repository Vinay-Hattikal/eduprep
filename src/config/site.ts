// Brand configuration (D-021). The product name appears ONLY here and in env/logo files.
// Renaming the product = change NEXT_PUBLIC_APP_NAME (and the fallbacks below), nothing else.

const name = process.env.NEXT_PUBLIC_APP_NAME || "EduPrep";

export const siteConfig = {
  name,
  shortName: name,
  tagline: "Get placement-ready, company by company",
  description: `${name} prepares BE/BTech freshers and experienced engineers for specific companies: verified hiring patterns, practice for every subject, real exam-style mock tests, a coding judge and 1:1 mock interviews.`,
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supportEmail: "support@example.com",
  locale: "en_IN",
  social: {
    linkedin: "",
    instagram: "",
    youtube: "",
    telegram: "",
  },
} as const;

export type SiteConfig = typeof siteConfig;
