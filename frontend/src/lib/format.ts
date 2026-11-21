import { countryName as sharedCountryName, type CountryCode, type ReportReason } from "@social-matching/shared";

/** "EG" → 🇪🇬: each letter maps to its regional indicator symbol. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function countryName(code: string): string {
  return sharedCountryName(code as CountryCode);
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const REPORT_REASONS: Record<ReportReason, string> = {
  harassment: "Harassment or hate",
  sexual_content: "Sexual content",
  scam_or_spam: "Scam or spam",
  underage: "Seems underage",
  other: "Something else",
};

const timeFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
