"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";

import { createQueryClient } from "@/lib/queries";

import { SessionProvider } from "./SessionProvider";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser tab, created once.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Honors the OS "reduce motion" setting for every animation. */}
      <MotionConfig reducedMotion="user">
        <SessionProvider>{children}</SessionProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
