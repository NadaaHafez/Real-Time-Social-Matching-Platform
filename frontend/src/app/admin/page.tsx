"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LegalTab } from "@/components/admin/LegalTab";
import { PacksTab } from "@/components/admin/PacksTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { useAdminGuard } from "@/components/admin/useAdminGuard";
import { Button, Loading, Screen, Segmented } from "@/components/ui";

type Tab = "reports" | "settings" | "packs" | "legal";

const TABS: { value: Tab; label: string; ownerOnly: boolean }[] = [
  { value: "reports", label: "Reports", ownerOnly: false },
  { value: "settings", label: "Settings", ownerOnly: true },
  { value: "packs", label: "Packs", ownerOnly: true },
  { value: "legal", label: "Legal", ownerOnly: true },
];

const PANELS: Record<Tab, () => React.JSX.Element> = {
  reports: ReportsTab,
  settings: SettingsTab,
  packs: PacksTab,
  legal: LegalTab,
};

/** Moderators see the report queue; owners also get settings, packs and legal. */
export default function AdminPage() {
  const role = useAdminGuard("moderator");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("reports");

  if (!role) return <Loading />;

  const tabs = TABS.filter((t) => !t.ownerOnly || role === "owner");
  const Panel = PANELS[tab];

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Button variant="ghost" className="px-2" onClick={() => router.push("/me")} aria-label="Back">
          ←
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Admin</h1>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">{role}</span>
      </header>

      {tabs.length > 1 && <Segmented<Tab> id="admin-tab" options={tabs} value={tab} onChange={setTab} />}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
          <Panel />
        </motion.div>
      </AnimatePresence>
    </Screen>
  );
}
