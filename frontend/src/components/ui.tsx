import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Phone-width column: the Pi Browser is a phone. */
export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">{children}</main>;
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">{children}</section>;
}

const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-zinc-700 text-zinc-100 hover:bg-zinc-800",
  danger: "border border-red-900 text-red-300 hover:bg-red-950",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      className={`rounded-xl px-4 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none focus:border-brand";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-400">{children}</p>;
}

export function Loading() {
  return (
    <Screen>
      <p className="m-auto text-zinc-500">Loading…</p>
    </Screen>
  );
}
