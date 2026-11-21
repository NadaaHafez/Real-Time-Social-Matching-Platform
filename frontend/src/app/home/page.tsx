"use client";

import type {
  CancelRollResponse,
  CurrentChatResponse,
  FilterState,
  QueueStats,
  RollResponse,
  RollsBalance,
} from "@social-matching/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, ApiError, errorMessage } from "@/lib/api";

const QUEUE_POLL_MS = 5_000;

/** A search in progress. `expiresAt` is null when we only know one exists (after a reload). */
type Search = { expiresAt: number | null };

export default function HomePage() {
  const ready = useGuard("app");
  const { profile, socket, signOut } = useSession();
  const router = useRouter();

  const [balance, setBalance] = useState<RollsBalance | null>(null);
  const [rollCost, setRollCost] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [search, setSearch] = useState<Search | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Still in a chat (say, after a reload)? Go back to it. Otherwise load the screen.
  useEffect(() => {
    if (!ready) return;

    api.get<CurrentChatResponse>("/chat/current").then(({ chat }) => chat && router.replace("/chat"), () => undefined);
    api.get<RollsBalance>("/rolls/balance").then(setBalance, (err) => setError(errorMessage(err)));
    api.get<FilterState>("/me/filters").then((state) => setRollCost(state.rollCost), () => undefined);
  }, [ready, router]);

  useEffect(() => {
    if (!ready) return;

    const poll = () => api.get<QueueStats>("/matchmaking/queue").then((q) => setWaiting(q.waiting), () => undefined);
    void poll();
    const timer = setInterval(poll, QUEUE_POLL_MS);
    return () => clearInterval(timer);
  }, [ready]);

  // The search ends on the server's side: a match, or nobody in time.
  useEffect(() => {
    if (!socket) return;

    socket.on("match:found", () => router.push("/chat"));
    socket.on("match:ended", (event) => {
      setSearch(null);
      setBalance(event.balance);
      setNotice(
        event.reason === "expired"
          ? `Nobody found this time. ${event.refunded} Roll${event.refunded === 1 ? "" : "s"} refunded.`
          : "Search cancelled. Your Rolls were refunded.",
      );
    });

    return () => {
      socket.off("match:found");
      socket.off("match:ended");
    };
  }, [socket, router]);

  async function roll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const ticket = await api.post<RollResponse>("/matchmaking/roll");
      setBalance(ticket.balance);
      setSearch({ expiresAt: Date.parse(ticket.expiresAt) });
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_rolling") setSearch({ expiresAt: null });
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<CancelRollResponse>("/matchmaking/cancel");
      setBalance(result.balance);
      setSearch(null);
      setNotice("Search cancelled. Your Rolls were refunded.");
    } catch (err) {
      // Matched a moment before cancelling: `match:found` is on its way.
      if (err instanceof ApiError && err.code === "already_matched") return;
      if (err instanceof ApiError && err.code === "not_rolling") setSearch(null);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !profile) return <Loading />;

  const canAfford = balance !== null && rollCost !== null && balance.available >= rollCost;

  return (
    <Screen>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">Signed in as</p>
          <p className="font-semibold">@{profile.username}</p>
        </div>
        <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <Card>
        <p className="text-sm text-zinc-500">Your Rolls</p>
        <p className="text-4xl font-bold">{balance?.available ?? "–"}</p>
        {balance && balance.held > 0 && <p className="text-sm text-zinc-500">{balance.held} held for your search</p>}
      </Card>

      <Card>
        <div className="flex flex-col gap-4 text-center">
          {search ? (
            <Searching expiresAt={search.expiresAt} onCancel={cancel} busy={busy} />
          ) : (
            <>
              <p className="text-zinc-400">
                {waiting === null ? "…" : `${waiting} ${waiting === 1 ? "person is" : "people are"} looking right now`}
              </p>
              <Button disabled={busy || !socket || !canAfford} onClick={roll}>
                {rollCost === null ? "Roll" : `Roll (${rollCost} Roll${rollCost === 1 ? "" : "s"})`}
              </Button>
              {balance && rollCost !== null && !canAfford && (
                <p className="text-sm text-zinc-500">Not enough Rolls. The shop is coming soon.</p>
              )}
            </>
          )}
          {notice && <p className="text-sm text-zinc-400">{notice}</p>}
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    </Screen>
  );
}

function Searching({ expiresAt, onCancel, busy }: { expiresAt: number | null; onCancel: () => void; busy: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <>
      <div className="mx-auto size-12 animate-spin rounded-full border-4 border-zinc-700 border-t-brand" />
      <p className="font-medium">Looking for someone…</p>
      {secondsLeft !== null && <p className="text-sm text-zinc-500">{secondsLeft}s left</p>}
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </>
  );
}
