import { countryName as sharedCountryName, type CountryCode } from "@social-matching/shared";

/** "EG" → 🇪🇬: each letter maps to its regional indicator symbol. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function countryName(code: string): string {
  return sharedCountryName(code as CountryCode);
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
