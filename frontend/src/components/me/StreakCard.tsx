"use client";

import { AnimatePresence, motion } from "motion/react";

import { Button, Card, ErrorText, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { useClaimStreak } from "@/lib/mutations";
import { useStreak } from "@/lib/queries";

/** One claim per UTC day. Missing a day starts again at day 1. */
export function StreakCard() {
  const streak = useStreak();
  const claim = useClaimStreak();

  const data = streak.data;

  return (
    <Card className="flex items-center gap-4">
      <motion.div
        key={data?.day}
        initial={{ scale: 0.6, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-accent text-center leading-none text-black"
      >
        <span>
          <span className="block text-[10px] font-bold uppercase">Day</span>
          <span className="text-2xl font-black">{data?.day ?? "–"}</span>
        </span>
      </motion.div>

      <div className="flex-1">
        <p className="font-semibold">Daily streak</p>
        <p className="text-sm text-zinc-500">
          {data ? `Best run: ${plural(data.bestStreak, "day")}` : "…"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {data?.claimedToday ? (
          <motion.p key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-sm text-zinc-400">
            ✓ +{data.bonusRolls} today
          </motion.p>
        ) : (
          <motion.div key="claim" exit={{ opacity: 0, scale: 0.8 }}>
            <Button className="px-3 py-2 text-sm" disabled={!data || claim.isPending} onClick={() => claim.mutate()}>
              {claim.isPending ? <Spinner className="size-4" /> : data ? `Claim +${data.bonusRolls}` : "Claim"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <ErrorText>{claim.error && errorMessage(claim.error)}</ErrorText>
    </Card>
  );
}
