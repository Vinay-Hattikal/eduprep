// Display formatting. Times are stored in UTC and shown in IST by default (rules.md, Data).

const TIME_ZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

/** Money is stored in paise; this shows it as rupees, e.g. 149900 → "₹1,499". */
export function formatPaise(paise: number): string {
  return rupeeFormatter.format(paise / 100);
}

/** First characters of Markdown as plain text, for lists. */
export function plainExcerpt(markdown: string, maxLength: number): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** "Ravi Kumar" → "Ravi K.": how students appear on leaderboards and in discussions. */
export function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}
