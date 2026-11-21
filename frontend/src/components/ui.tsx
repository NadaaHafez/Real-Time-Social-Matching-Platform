"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { BottomNav } from "./BottomNav";

/** Phone-width column, faded in: the Pi Browser is a phone. `nav` adds the bottom tabs. */
export function Screen({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-6 ${nav ? "pb-28" : "pb-6"}`}
      >
        {children}
      </motion.main>
      {nav && <BottomNav />}
    </>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

const VARIANTS = {
  primary: "bg-gradient-to-br from-brand to-brand-deep text-white shadow-lg shadow-brand/25",
  secondary: "border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10",
  ghost: "text-zinc-400 hover:text-zinc-100",
  danger: "border border-red-500/30 text-red-300 hover:bg-red-500/10",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: HTMLMotionProps<"button"> & { variant?: keyof typeof VARIANTS }) {
  return (
    <motion.button
      whileTap={props.disabled ? undefined : { scale: 0.97 }}
      className={`rounded-2xl px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** A labelled control with the shared schema's message under it. */
export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-400">{label}</span>
      {children}
      {error && (
        <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-red-400">
          {error}
        </motion.span>
      )}
    </label>
  );
}

const controlClass =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-zinc-100 outline-none transition " +
  "placeholder:text-zinc-600 focus:border-brand focus:ring-4 focus:ring-brand/20 aria-invalid:border-red-500/60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${controlClass} ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return <select ref={ref} className={`${controlClass} appearance-none ${className}`} {...props} />;
  },
);

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-red-400">
      {children}
    </motion.p>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-white/20 border-t-white ${className}`} />;
}

export function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-8" />
    </main>
  );
}

/** An on/off switch. The knob springs across. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
        checked ? "justify-end bg-brand" : "justify-start bg-white/10"
      }`}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className="size-5 rounded-full bg-white shadow" />
    </button>
  );
}

/** One choice out of a few. `id` keeps two controls' highlights from jumping between them. */
export function Segmented<T extends string>({
  id,
  options,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex gap-1 rounded-2xl bg-black/30 p-1 ${disabled ? "opacity-40" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className="relative flex-1 rounded-xl px-3 py-2 text-sm font-medium"
        >
          {value === option.value && (
            <motion.span
              layoutId={`segmented-${id}`}
              className="absolute inset-0 rounded-xl bg-white/10"
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
          <span className={`relative ${value === option.value ? "text-zinc-100" : "text-zinc-500"}`}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
