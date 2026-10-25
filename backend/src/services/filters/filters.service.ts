import type {
  BuySlotRequest,
  BuySlotResponse,
  CountryCode,
  CountryMode,
  FilterState,
  Gender,
  MatchFilterModel,
  MatchFilters,
  SlotAllowance,
} from "@social-matching/shared";

import prisma, { TransactionClient } from "../../config/database";
import { HttpError } from "../../utils/httpError";
import * as ledger from "../rolls/ledger.service";
import { getSettings, Settings } from "../settings/settings.service";

/** What a roll applies. Off, or on with nothing picked, becomes "no check" (null / `anyone`). */
export interface FilterSnapshot {
  minAge: number | null;
  maxAge: number | null;
  gender: Gender | "anyone";
  countryMode: CountryMode | null;
  countries: CountryCode[];
}

const FILTER_FIELDS = {
  ageEnabled: true,
  minAge: true,
  maxAge: true,
  genderEnabled: true,
  gender: true,
  countryEnabled: true,
  countryMode: true,
  includeCountries: true,
  excludeCountries: true,
  extraIncludeSlots: true,
  extraExcludeSlots: true,
} as const satisfies Partial<Record<keyof MatchFilterModel, true>>;

type FilterRow = Pick<MatchFilterModel, keyof typeof FILTER_FIELDS>;

// ============================================================================
// PURE: row → API shapes, filters → snapshot → price
// ============================================================================

function toFilters(row: FilterRow): MatchFilters {
  return {
    age: { enabled: row.ageEnabled, min: row.minAge, max: row.maxAge },
    gender: { enabled: row.genderEnabled, value: row.gender },
    country: {
      enabled: row.countryEnabled,
      mode: row.countryMode,
      // Only ever written by updateFilters, after validation against the shared list.
      include: row.includeCountries as CountryCode[],
      exclude: row.excludeCountries as CountryCode[],
    },
  };
}

export function snapshotOf({ age, gender, country }: MatchFilters): FilterSnapshot {
  const activeList = country.mode === "include" ? country.include : country.exclude;
  const countryOn = country.enabled && activeList.length > 0;

  return {
    minAge: age.enabled ? age.min : null,
    maxAge: age.enabled ? age.max : null,
    gender: gender.enabled && gender.value ? gender.value : "anyone",
    countryMode: countryOn ? country.mode : null,
    countries: countryOn ? activeList : [],
  };
}

export function rollCostOf(snapshot: FilterSnapshot, settings: Settings): number {
  return (
    settings.baseRollCost +
    (snapshot.minAge !== null ? settings.ageFilterCost : 0) +
    (snapshot.gender !== "anyone" ? settings.genderFilterCost : 0) +
    (snapshot.countryMode !== null ? settings.countryFilterCost : 0)
  );
}

function slotsFor(mode: CountryMode, row: FilterRow, settings: Settings): SlotAllowance {
  const include = mode === "include";
  const bought = include ? row.extraIncludeSlots : row.extraExcludeSlots;
  const max = include ? settings.maxExtraIncludeSlots : settings.maxExtraExcludeSlots;

  return {
    free: include ? settings.freeIncludeSlots : settings.freeExcludeSlots,
    bought,
    canBuy: Math.max(0, max - bought),
    price: include ? settings.includeSlotPrice : settings.excludeSlotPrice,
  };
}

function stateOf(row: FilterRow, settings: Settings): FilterState {
  const filters = toFilters(row);

  return {
    filters,
    slots: { include: slotsFor("include", row, settings), exclude: slotsFor("exclude", row, settings) },
    rollCost: rollCostOf(snapshotOf(filters), settings),
  };
}

// ============================================================================
// DATABASE
// ============================================================================

/**
 * Locks the row until the transaction ends, creating it on first use. Saving filters, buying
 * a slot and (later) starting a roll all take it, so none of them sees a half-made change.
 */
export async function lockFilters(tx: TransactionClient, userId: string): Promise<FilterRow> {
  await tx.$executeRaw`INSERT INTO match_filters (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
  await tx.$queryRaw`SELECT 1 FROM match_filters WHERE user_id = ${userId} FOR UPDATE`;
  return tx.matchFilter.findUniqueOrThrow({ where: { userId }, select: FILTER_FIELDS });
}

/** What a roll applies, read under the filter lock so a save cannot land mid-roll. */
export async function lockSnapshot(tx: TransactionClient, userId: string): Promise<FilterSnapshot> {
  return snapshotOf(toFilters(await lockFilters(tx, userId)));
}

export async function getFilterState(userId: string): Promise<FilterState> {
  const row = await prisma.matchFilter.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: FILTER_FIELDS,
  });

  return stateOf(row, await getSettings());
}

/**
 * Replaces the filters. A list may hold free + bought countries. One already over the limit
 * (because free slots were lowered) may be kept or changed, just not made longer.
 */
export async function updateFilters(userId: string, next: MatchFilters): Promise<FilterState> {
  const settings = await getSettings();

  if (next.age.enabled && next.age.min < settings.minimumAge) {
    throw HttpError.badRequest("below_minimum_age", `Matching is limited to ages ${settings.minimumAge} and up.`);
  }

  return prisma.$transaction(async (tx) => {
    const saved = await lockFilters(tx, userId);

    const lists = [
      { mode: "include", next: next.country.include, saved: saved.includeCountries },
      { mode: "exclude", next: next.country.exclude, saved: saved.excludeCountries },
    ] as const;

    for (const list of lists) {
      const { free, bought } = slotsFor(list.mode, saved, settings);
      const limit = free + bought;

      if (list.next.length > limit && list.next.length > list.saved.length) {
        throw HttpError.badRequest(
          "not_enough_slots",
          `You have ${limit} ${list.mode} slots. Buy another slot to add more countries.`,
        );
      }
    }

    const row = await tx.matchFilter.update({
      where: { userId },
      data: {
        ageEnabled: next.age.enabled,
        minAge: next.age.min,
        maxAge: next.age.max,
        genderEnabled: next.gender.enabled,
        gender: next.gender.value,
        countryEnabled: next.country.enabled,
        countryMode: next.country.mode,
        includeCountries: next.country.include,
        excludeCountries: next.country.exclude,
      },
      select: FILTER_FIELDS,
    });

    return stateOf(row, settings);
  });
}

/**
 * Buys one more country slot with Rolls. The client sends the slot number and the price it
 * showed: a repeat of a bought slot charges nothing, and a stale number or price is refused.
 */
export async function buySlot(userId: string, { mode, slot, price }: BuySlotRequest): Promise<BuySlotResponse> {
  const settings = await getSettings();
  const idempotencyKey = `slot:${userId}:${mode}:${slot}`;

  return prisma.$transaction(async (tx) => {
    // One purchase per user at a time, so `bought` cannot change under the checks below.
    const row = await lockFilters(tx, userId);

    // Before the checks: after a successful buy, a retry's slot number is no longer bought + 1.
    const done = await tx.ledgerEntry.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (done) return { state: stateOf(row, settings), balance: await ledger.getBalance(userId) };

    const { bought, canBuy, price: currentPrice } = slotsFor(mode, row, settings);

    if (canBuy === 0) throw HttpError.conflict("slot_limit_reached", `You cannot buy more ${mode} slots.`);
    if (slot !== bought + 1) throw HttpError.conflict("slot_changed", "Your slots have changed. Refresh and try again.");
    if (price !== currentPrice) throw HttpError.conflict("price_changed", `A slot now costs ${currentPrice} Rolls.`);

    const { applied, balance } = await ledger.unlock(
      { userId, amount: currentPrice, ref: `slot:${mode}:${slot}`, idempotencyKey },
      tx,
    );

    // Only a charge that actually happened grants the slot.
    const updated = applied
      ? await tx.matchFilter.update({
          where: { userId },
          data: mode === "include" ? { extraIncludeSlots: { increment: 1 } } : { extraExcludeSlots: { increment: 1 } },
          select: FILTER_FIELDS,
        })
      : row;

    return { state: stateOf(updated, settings), balance };
  });
}
