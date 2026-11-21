"use client";

import type { PartnerSummary } from "@social-matching/shared";
import { motion } from "motion/react";

import { countryFlag, countryName } from "@/lib/format";

/** Shown for a moment when a match lands, before the chat opens. */
export function MatchReveal({ partner }: { partner: PartnerSummary }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-surface px-10 py-8 text-center"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        <motion.span
          className="text-6xl"
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", delay: 0.15 }}
        >
          {countryFlag(partner.country)}
        </motion.span>
        <p className="text-sm uppercase tracking-widest text-accent">It&apos;s a match</p>
        <p className="text-2xl font-bold">{partner.displayName}</p>
        <p className="text-zinc-400">
          {partner.age} · {partner.gender} · {countryName(partner.country)}
        </p>
      </motion.div>
    </motion.div>
  );
}
