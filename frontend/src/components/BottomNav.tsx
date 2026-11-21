"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "Roll", icon: "◉" },
  { href: "/filters", label: "Filters", icon: "⚙" },
  { href: "/shop", label: "Shop", icon: "✦" },
];

/** The main screens. Chat and onboarding have none: they are steps, not places. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md gap-2 border-t border-white/5 bg-canvas/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      {TABS.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link key={tab.href} href={tab.href} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2">
            {/* One highlight, sliding between tabs. */}
            {active && (
              <motion.span
                layoutId="nav-highlight"
                className="absolute inset-0 rounded-2xl bg-white/5"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative text-lg ${active ? "text-accent" : "text-zinc-500"}`}>{tab.icon}</span>
            <span className={`relative text-xs font-medium ${active ? "text-zinc-100" : "text-zinc-500"}`}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
