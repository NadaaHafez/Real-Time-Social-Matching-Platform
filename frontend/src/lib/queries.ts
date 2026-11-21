import type {
  CurrentChatResponse,
  DailyStreak,
  FilterState,
  LedgerPage,
  LegalDocuments,
  Profile,
  QueueStats,
  RollPack,
  RollsBalance,
} from "@social-matching/shared";
import { QueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** Every piece of server state, by one key each. Socket events write to these keys too. */
export const keys = {
  profile: ["profile"],
  // Everything under "rolls" changes together: invalidate ["rolls"] after any Roll movement.
  balance: ["rolls", "balance"],
  streak: ["rolls", "streak"],
  ledger: ["rolls", "ledger"],
  filters: ["filters"],
  queue: ["matchmaking", "queue"],
  currentChat: ["chat", "current"],
  legal: ["legal"],
  packs: ["payments", "packs"],
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export const fetchProfile = () => api.get<Profile>("/me/profile");

export const useProfile = (enabled = true) => useQuery({ queryKey: keys.profile, queryFn: fetchProfile, enabled });

// `enabled`: pages pass whether the session is ready, so nothing is fetched before the token is.

export const useBalance = (enabled = true) =>
  useQuery({ queryKey: keys.balance, queryFn: () => api.get<RollsBalance>("/rolls/balance"), enabled });

export const useFilters = (enabled = true) =>
  useQuery({ queryKey: keys.filters, queryFn: () => api.get<FilterState>("/me/filters"), enabled });

export const useQueue = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.queue,
    queryFn: () => api.get<QueueStats>("/matchmaking/queue"),
    refetchInterval: 5_000,
    staleTime: 0,
  });

export const useCurrentChat = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.currentChat,
    queryFn: () => api.get<CurrentChatResponse>("/chat/current"),
    staleTime: 0,
  });

export const useStreak = (enabled = true) =>
  useQuery({ queryKey: keys.streak, queryFn: () => api.get<DailyStreak>("/rolls/streak"), enabled });

/** The wallet history, a page at a time. The cursor is the last entry the previous page ended on. */
export const useLedger = (enabled = true) =>
  useInfiniteQuery({
    queryKey: keys.ledger,
    queryFn: ({ pageParam }) =>
      api.get<LedgerPage>(`/rolls/ledger?limit=15${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });

export const usePacks = (enabled = true) =>
  useQuery({ queryKey: keys.packs, queryFn: () => api.get<RollPack[]>("/payments/packs"), enabled });

export const useLegal = (enabled = true) =>
  useQuery({ queryKey: keys.legal, queryFn: () => api.get<LegalDocuments>("/legal"), enabled });
