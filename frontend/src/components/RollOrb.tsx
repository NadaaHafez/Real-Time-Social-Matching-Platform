"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const SIZE = 224;
const RING_RADIUS = SIZE / 2 + 10;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The roll button. Idle, it breathes. Searching, ripples go out and a ring counts down the
 * time left (`progress` from 1 to 0, or null when unknown).
 */
export function RollOrb({
  searching,
  progress,
  disabled,
  onClick,
  children,
}: {
  searching: boolean;
  progress: number | null;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative mx-auto my-4 grid place-items-center" style={{ width: SIZE + 40, height: SIZE + 40 }}>
      <AnimatePresence>
        {searching &&
          [0, 1, 2].map((ring) => (
            <motion.span
              key={ring}
              className="absolute rounded-full border-2 border-brand/50"
              style={{ width: SIZE, height: SIZE }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.7, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, delay: ring * 0.8, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
      </AnimatePresence>

      {searching && progress !== null && (
        <svg className="absolute -rotate-90" width={SIZE + 40} height={SIZE + 40}>
          <circle cx="50%" cy="50%" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="4" />
          <motion.circle
            cx="50%"
            cy="50%"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            animate={{ strokeDashoffset: RING_LENGTH * (1 - progress) }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
      )}

      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="relative grid place-items-center rounded-full bg-gradient-to-br from-brand via-brand-deep to-[#4c1d95] text-white shadow-2xl shadow-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ width: SIZE, height: SIZE }}
        animate={searching ? { scale: [1, 0.97, 1] } : { scale: [1, 1.03, 1] }}
        transition={{ duration: searching ? 1.2 : 3, repeat: Infinity, ease: "easeInOut" }}
        whileTap={disabled ? undefined : { scale: 0.94 }}
      >
        {children}
      </motion.button>
    </div>
  );
}
