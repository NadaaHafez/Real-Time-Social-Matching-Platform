"use client";

import type { PaymentReceipt, RollPack } from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Button, Card, ErrorText, Loading, Screen, Spinner } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { payWithPi } from "@/lib/pi";
import { keys, useBalance, usePacks } from "@/lib/queries";

/** The backend's three steps, called by Pi at the right moments. */
const steps = {
  approve: (paymentId: string) => api.post("/payments/approve", { paymentId }),
  complete: (paymentId: string) => api.post<PaymentReceipt>("/payments/complete", { paymentId }),
  cancel: (paymentId: string) => api.post("/payments/cancel", { paymentId }),
};

export default function ShopPage() {
  const ready = useGuard("app");
  const queryClient = useQueryClient();
  const packs = usePacks(ready);
  const balance = useBalance(ready);
  const [notice, setNotice] = useState<string | null>(null);
  const [credited, setCredited] = useState<number | null>(null);

  const buy = useMutation({
    mutationFn: (pack: RollPack) =>
      // The amount must match the pack's price exactly: the backend refuses anything else.
      payWithPi(
        { amount: pack.priceInPi, memo: `${plural(pack.rolls, "Roll")}`, metadata: { packId: pack.id } },
        steps,
      ),
    onMutate: () => {
      setNotice(null);
      setCredited(null);
    },
    onSuccess: (receipt) => {
      if (!receipt) return setNotice("Payment cancelled. Nothing was charged.");

      queryClient.setQueryData(keys.balance, receipt.balance);
      void queryClient.invalidateQueries({ queryKey: ["rolls"] });

      if (receipt.status === "completed") setCredited(receipt.rollsCredited);
      else setNotice("The payment was not signed, so it was cancelled. Nothing was charged.");
    },
  });

  if (!ready) return <Loading />;

  const buying = buy.isPending ? buy.variables?.id : null;

  return (
    <Screen nav>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Shop</h1>
          <p className="text-zinc-500">Rolls are spent each time you roll.</p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <p className="text-sm text-zinc-500">You have</p>
          <p className="text-2xl font-black">{balance.data?.available ?? "–"}</p>
        </div>
      </header>

      {packs.isPending && <Spinner className="mx-auto size-8" />}
      <ErrorText>{packs.error && errorMessage(packs.error)}</ErrorText>

      <div className="flex flex-col gap-3">
        {packs.data?.map((pack, index) => (
          <motion.div
            key={pack.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
          >
            <Card className={`flex items-center gap-4 ${pack.tag ? "border-brand/40" : ""}`}>
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-accent text-xl font-black">
                {pack.rolls}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{plural(pack.rolls, "Roll")}</p>
                {pack.tag && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{pack.tag}</span>
                )}
              </div>
              <Button className="min-w-24" disabled={buy.isPending} onClick={() => buy.mutate(pack)}>
                {buying === pack.id ? <Spinner /> : `π ${pack.priceInPi}`}
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-xs text-zinc-600">Payments go through your Pi wallet. In the sandbox they use Testnet Pi.</p>

      {notice && <p className="text-center text-sm text-zinc-400">{notice}</p>}
      <ErrorText>{buy.error && (buy.error instanceof Error ? buy.error.message : errorMessage(buy.error))}</ErrorText>

      <AnimatePresence>{credited !== null && <Credited rolls={credited} onClose={() => setCredited(null)} />}</AnimatePresence>
    </Screen>
  );
}

function Credited({ rolls, onClose }: { rolls: number; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="flex flex-col items-center gap-2 rounded-3xl border border-white/10 bg-surface px-10 py-8 text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      >
        <motion.p
          className="text-5xl font-black text-accent"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          +{rolls}
        </motion.p>
        <p className="text-lg font-semibold">Rolls added</p>
        <p className="text-sm text-zinc-500">Tap to continue</p>
      </motion.div>
    </motion.div>
  );
}
