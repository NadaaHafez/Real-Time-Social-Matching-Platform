"use client";

import type { CancelRollResponse, PartnerSummary, RollResponse, RollsBalance } from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MatchReveal } from "@/components/MatchReveal";
import { RollOrb } from "@/components/RollOrb";
import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, ApiError, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { keys, useBalance, useCurrentChat, useFilters, useQueue } from "@/lib/queries";

/** How long the match reveal shows before the chat opens. */
const REVEAL_MS = 1_600;

/** A search in progress. Times are null when we only know one exists (after a reload). */
type Search = { startedAt: number; expiresAt: number | null };

export default function HomePage() {
  const ready = useGuard("app");
  const { profile, socket } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const balance = useBalance(ready);
  const filters = useFilters(ready);
  const queue = useQueue(ready);
  const currentChat = useCurrentChat(ready);

  const [search, setSearch] = useState<Search | null>(null);
  const [matched, setMatched] = useState<PartnerSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(!!search);

  const setBalance = (value: RollsBalance) => queryClient.setQueryData(keys.balance, value);

  // Still in a chat, say after a reload? Go back to it.
  useEffect(() => {
    if (currentChat.data?.chat) router.replace("/chat");
  }, [currentChat.data, router]);

  // Outcomes the server decides on its own arrive here, and go straight into the cache.
  useEffect(() => {
    if (!socket) return;

    socket.on("match:found", (event) => {
      setSearch(null);
      setMatched(event.partner);
      void queryClient.invalidateQueries({ queryKey: keys.currentChat });
      void queryClient.invalidateQueries({ queryKey: keys.balance });
      setTimeout(() => router.push("/chat"), REVEAL_MS);
    });

    socket.on("match:ended", (event) => {
      setSearch(null);
      queryClient.setQueryData(keys.balance, event.balance);
      setNotice(
        event.reason === "expired"
          ? `Nobody this time. ${plural(event.refunded, "Roll")} refunded.`
          : "Search cancelled. Your Rolls were refunded.",
      );
    });

    return () => {
      socket.off("match:found");
      socket.off("match:ended");
    };
  }, [socket, router, queryClient]);

  const roll = useMutation({
    mutationFn: () => api.post<RollResponse>("/matchmaking/roll"),
    onMutate: () => setNotice(null),
    onSuccess: (ticket) => {
      setBalance(ticket.balance);
      setSearch({ startedAt: Date.now(), expiresAt: Date.parse(ticket.expiresAt) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "already_rolling") setSearch({ startedAt: Date.now(), expiresAt: null });
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.post<CancelRollResponse>("/matchmaking/cancel"),
    onSuccess: (result) => {
      setBalance(result.balance);
      setSearch(null);
      setNotice("Search cancelled. Your Rolls were refunded.");
    },
    onError: (err) => {
      // Matched a moment before: `match:found` is on its way. Nothing to cancel: stop showing it.
      if (err instanceof ApiError && err.code === "not_rolling") setSearch(null);
    },
  });

  if (!ready || !profile) return <Loading />;

  const available = balance.data?.available;
  const rollCost = filters.data?.rollCost;
  const canAfford = available !== undefined && rollCost !== undefined && available >= rollCost;
  const rollError = roll.error && !(roll.error instanceof ApiError && roll.error.code === "already_rolling");

  return (
    <Screen nav>
      <header>
        <p className="text-sm text-zinc-500">Hi,</p>
        <p className="text-xl font-bold">@{profile.username}</p>
      </header>

      <Card className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500">Your Rolls</p>
          <motion.p key={available} initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-4xl font-black">
            {available ?? "–"}
          </motion.p>
        </div>
        {!!balance.data?.held && <p className="text-sm text-zinc-500">{balance.data.held} held while searching</p>}
      </Card>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <RollOrb
          searching={!!search}
          progress={search ? progressOf(search, now) : null}
          disabled={!search && (roll.isPending || !socket || !canAfford)}
          onClick={() => (search ? undefined : roll.mutate())}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={search ? "searching" : "idle"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col items-center"
            >
              <span className="text-3xl font-black">{search ? "Looking…" : "Roll"}</span>
              <span className="text-sm text-white/70">
                {search ? secondsLeft(search, now) : rollCost !== undefined && plural(rollCost, "Roll")}
              </span>
            </motion.span>
          </AnimatePresence>
        </RollOrb>

        {search ? (
          <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel search
          </Button>
        ) : (
          <p className="text-sm text-zinc-500">{queue.data ? lookingLabel(queue.data.waiting) : "…"}</p>
        )}

        {!search && available !== undefined && rollCost !== undefined && !canAfford && (
          <Link href="/shop" className="text-sm text-accent underline-offset-4 hover:underline">
            Not enough Rolls. Get more in the shop →
          </Link>
        )}
        {notice && <p className="text-center text-sm text-zinc-400">{notice}</p>}
        <ErrorText>{rollError && errorMessage(roll.error)}</ErrorText>
      </div>

      <AnimatePresence>{matched && <MatchReveal partner={matched} />}</AnimatePresence>
    </Screen>
  );
}

/** The current time, updated every second while `active`. Drives the countdown ring and text. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);

  return now;
}

/** From 1 at the start of the search to 0 at its end. Null when the end is unknown. */
function progressOf(search: Search, now: number): number | null {
  if (search.expiresAt === null) return null;
  return Math.max(0, Math.min(1, (search.expiresAt - now) / (search.expiresAt - search.startedAt)));
}

function secondsLeft(search: Search, now: number): string {
  if (search.expiresAt === null) return "still searching";
  return `${Math.max(0, Math.ceil((search.expiresAt - now) / 1000))}s left`;
}

function lookingLabel(waiting: number): string {
  if (waiting === 0) return "Nobody else is looking right now";
  return waiting === 1 ? "1 person is looking right now" : `${waiting} people are looking right now`;
}
