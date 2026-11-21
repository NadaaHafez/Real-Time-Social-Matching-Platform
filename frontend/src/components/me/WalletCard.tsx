"use client";

import type { LedgerEntryType } from "@social-matching/shared";
import { motion } from "motion/react";

import { Button, Card, Spinner } from "@/components/ui";
import { useBalance, useLedger } from "@/lib/queries";

/** Holds and refunds never appear: the backend leaves them out, as they change nothing you own. */
const LABELS: Partial<Record<LedgerEntryType, string>> = {
  welcome: "Welcome gift",
  bonus: "Daily streak",
  purchase: "Bought with Pi",
  spend: "Matched",
  unlock: "Country slot",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function WalletCard() {
  const balance = useBalance();
  const ledger = useLedger();
  const entries = ledger.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500">Wallet</p>
          <p className="text-3xl font-black">{balance.data?.available ?? "–"} Rolls</p>
        </div>
        {!!balance.data?.held && <p className="text-sm text-zinc-500">{balance.data.held} held</p>}
      </div>

      <ul className="flex flex-col divide-y divide-white/5">
        {entries.map((entry, index) => (
          <motion.li
            key={entry.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 10) * 0.03 }}
            className="flex items-center justify-between py-2.5"
          >
            <div>
              <p className="text-sm font-medium">{LABELS[entry.type] ?? entry.type}</p>
              <p className="text-xs text-zinc-500">{dateFormat.format(new Date(entry.createdAt))}</p>
            </div>
            <p className={`font-semibold tabular-nums ${entry.amount > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
              {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
            </p>
          </motion.li>
        ))}
      </ul>

      {ledger.isPending && <Spinner className="mx-auto" />}
      {ledger.data && entries.length === 0 && <p className="text-center text-sm text-zinc-500">Nothing yet.</p>}
      {ledger.hasNextPage && (
        <Button variant="secondary" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
          {ledger.isFetchingNextPage ? <Spinner /> : "Show more"}
        </Button>
      )}
    </Card>
  );
}
