import type {
  CurrentChatResponse,
  FilterState,
  LegalDocuments,
  Profile,
  QueueStats,
  RollPack,
  RollsBalance,
} from "@social-matching/shared";
import { QueryClient, useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** Every piece of server state, by one key each. Socket events write to these keys too. */
export const keys = {
  profile: ["profile"],
  balance: ["rolls", "balance"],
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

export const usePacks = (enabled = true) =>
  useQuery({ queryKey: keys.packs, queryFn: () => api.get<RollPack[]>("/payments/packs"), enabled });

export const useLegal = (enabled = true) =>
  useQuery({ queryKey: keys.legal, queryFn: () => api.get<LegalDocuments>("/legal"), enabled });
