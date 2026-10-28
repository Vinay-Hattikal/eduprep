// Rules for what people type when signing up or in (D-043). Pure, shared by forms and server.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const CODE_LENGTH = 6;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * Indian mobile numbers in E.164 (+91 and 10 digits starting 6-9). Accepts spaces, dashes,
 * a leading 0, 91 or +91. Returns null for anything else.
 */
export function normalizeIndianPhone(value: string): string | null {
  let digits = value.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

// The most common passwords seen in Indian and global leaks; enough to stop the obvious ones.
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "11111111",
  "00000000",
  "abcd1234",
  "india123",
  "welcome1",
  "admin123",
  "letmein1",
  "passw0rd",
  "sunshine",
  "princess",
  "football",
  "computer",
]);

/** Why a password is too weak, or null. */
export function passwordProblem(
  password: string,
  context: { email?: string; name?: string } = {},
): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "This password is too common. Choose another.";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local))
    return "Don't use your email address in the password.";
  return null;
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)} •••••${phone.slice(-4)}`;
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}
