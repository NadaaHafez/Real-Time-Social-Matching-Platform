"use client";

import { AnimatePresence } from "motion/react";
import Link from "next/link";

import { ProfileForm } from "@/components/me/ProfileForm";
import { StreakCard } from "@/components/me/StreakCard";
import { WalletCard } from "@/components/me/WalletCard";
import { WarningBanner } from "@/components/me/WarningBanner";
import { useSession } from "@/components/SessionProvider";
import { Button, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { countryFlag, countryName } from "@/lib/format";

export default function MePage() {
  const ready = useGuard("app");
  const { profile, signOut } = useSession();

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
