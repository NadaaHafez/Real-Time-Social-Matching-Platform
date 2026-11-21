import type { AdminMe, AdminPack, AppSettings, ReportDetail, ReportsPage, ReportStatus } from "@social-matching/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api, ApiError } from "./api";

/** Everything under "admin", so a resolve or a save can refresh the lot with one key. */
export const adminKeys = {
  me: ["admin", "me"],
  reports: (status: ReportStatus) => ["admin", "reports", status],
  report: (id: string) => ["admin", "report", id],
  settings: ["admin", "settings"],
  packs: ["admin", "packs"],
} as const;

/**
 * The caller's staff role, or null for everyone else. A 403 is the normal answer for users,
 * so it is turned into null rather than an error.
 */
export const useAdminRole = (enabled = true) =>
  useQuery({
    queryKey: adminKeys.me,
    queryFn: async () => {
      try {
        return (await api.get<AdminMe>("/admin/me")).role;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) return null;
        throw err;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
  });

export const useReports = (status: ReportStatus) =>
  useInfiniteQuery({
    queryKey: adminKeys.reports(status),
    queryFn: ({ pageParam }) =>
      api.get<ReportsPage>(`/admin/reports?status=${status}&limit=20${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export const useReport = (id: string | null) =>
  useQuery({ queryKey: adminKeys.report(id ?? ""), queryFn: () => api.get<ReportDetail>(`/admin/reports/${id}`), enabled: !!id });

export const useAppSettings = () =>
  useQuery({ queryKey: adminKeys.settings, queryFn: () => api.get<AppSettings>("/admin/settings") });

export const useAdminPacks = () => useQuery({ queryKey: adminKeys.packs, queryFn: () => api.get<AdminPack[]>("/admin/packs") });
