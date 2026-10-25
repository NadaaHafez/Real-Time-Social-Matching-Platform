import type { CountryCode, Gender } from "@social-matching/shared";

import type { FilterSnapshot } from "../filters/filters.service";

/** No I/O here: everything a pass needs is already in memory. */

export interface Profile {
  age: number;
  gender: Gender;
  country: CountryCode;
}

export interface WaitingTicket {
  id: string;
  userId: string;
  username: string;
  rollCost: number;
  expiresAt: number;
  /** The filters this roll applies, copied at roll time: later edits wait for the next roll. */
  filters: FilterSnapshot;
  /** What other people's filters are checked against. */
  profile: Profile;
  /** Users this one was blocked with (either way), read once at roll time. */
  blocked: Set<string>;
}

/** Does `viewer`'s filter accept `other`'s profile? One direction; matching checks both. */
function accepts(viewer: FilterSnapshot, other: Profile): boolean {
  const age = viewer.minAge === null || (other.age >= viewer.minAge && other.age <= (viewer.maxAge ?? Infinity));
  const gender = viewer.gender === "anyone" || viewer.gender === other.gender;
  const country =
    viewer.countryMode === null ||
    (viewer.countryMode === "include") === viewer.countries.includes(other.country);

  return age && gender && country;
}

export function compatible(a: WaitingTicket, b: WaitingTicket): boolean {
  if (a.userId === b.userId) return false;
  if (a.blocked.has(b.userId) || b.blocked.has(a.userId)) return false;

  return accepts(a.filters, b.profile) && accepts(b.filters, a.profile);
}

/**
 * Greedy, oldest first: whoever has waited longest gets first pick. Quadratic, but in memory:
 * 1,000 waiting is half a million cheap checks, about a millisecond. Past that, bucket by filter.
 */
export function pairWaiting(waiting: WaitingTicket[]): Array<[WaitingTicket, WaitingTicket]> {
  const pairs: Array<[WaitingTicket, WaitingTicket]> = [];
  const taken = new Set<string>();

  for (let i = 0; i < waiting.length; i += 1) {
    const a = waiting[i];
    if (taken.has(a.id)) continue;

    for (let j = i + 1; j < waiting.length; j += 1) {
      const b = waiting[j];
      if (taken.has(b.id) || !compatible(a, b)) continue;

      pairs.push([a, b]);
      taken.add(a.id);
      taken.add(b.id);
      break;
    }
  }

  return pairs;
}
