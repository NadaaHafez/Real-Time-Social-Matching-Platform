"use client";

import { AnimatePresence } from "motion/react";
import Link from "next/link";

import { ProfileForm } from "@/components/me/ProfileForm";
import { StreakCard } from "@/components/me/StreakCard";
import { WalletCard } from "@/components/me/WalletCard";
import { WarningBanner } from "@/components/me/WarningBanner";
import { useSession } from "@/components/SessionProvider";
import { Button, Card, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { useAdminRole } from "@/lib/adminQueries";
import { countryFlag, countryName } from "@/lib/format";

export default function MePage() {
  const ready = useGuard("app");
  const { profile, signOut } = useSession();
  // Null for everyone but moderators and owners, so the link stays hidden.
  const adminRole = useAdminRole(ready);

  if (!ready || !profile) return <Loading />;

  return (
    <Screen nav>
      <header className="flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-3xl">
          {profile.country ? countryFlag(profile.country) : "☺"}
        </span>
        <div>
          <h1 className="text-2xl font-bold">@{profile.username}</h1>
          <p className="text-sm text-zinc-500">
            {profile.age} · {profile.gender} · {profile.country && countryName(profile.country)}
          </p>
        </div>
      </header>

      <AnimatePresence>
        {profile.pendingWarning && <WarningBanner key="warning" message={profile.pendingWarning.message} />}
      </AnimatePresence>

      {adminRole.data && (
        <Link href="/admin">
          <Card className="flex items-center gap-3 border-accent/30 py-4 transition-colors hover:border-accent/60">
            <span className="text-xl">🛡️</span>
            <p className="flex-1 font-semibold">Admin</p>
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs text-accent">{adminRole.data}</span>
            <span className="text-zinc-600">›</span>
          </Card>
        </Link>
      )}

      <StreakCard />
      <WalletCard />
      <ProfileForm profile={profile} />

      <div className="flex items-center justify-between">
        <Link href="/legal" className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline">
          Terms &amp; privacy
        </Link>
        <Button variant="ghost" className="text-sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Screen>
  );
}
