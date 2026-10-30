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

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08" → "Aug 2026" (the months questions were asked in). */
export function formatMonth(ym: string): string {
  return `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

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
/** Cuts text to `max` characters, ending with "…" when it was longer. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function plainExcerpt(markdown: string, maxLength: number): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text, maxLength);
}

/** "Ravi Kumar" → "Ravi K.": how students appear on leaderboards and in discussions. */
export function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}
