"use client";

import type { Profile } from "@social-matching/shared";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";

import { useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

/** A moderator's warning, shown until dismissed. It restricts nothing. */
export function WarningBanner({ message }: { message: string }) {
  const { setProfile } = useSession();

  const dismiss = useMutation({
    mutationFn: () => api.post<Profile>("/me/warning/ack"),
    onSuccess: setProfile,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-col gap-3 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <p className="font-semibold text-amber-300">A note from our moderators</p>
      <p className="text-sm text-amber-100/80">{message}</p>
      <Button variant="secondary" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
        Got it
      </Button>
    </motion.div>
  );
}
