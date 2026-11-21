"use client";

import type { ReportStatus } from "@social-matching/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { Button, Card, ErrorText, Segmented, Spinner } from "@/components/ui";
import { useReports } from "@/lib/adminQueries";
import { errorMessage } from "@/lib/api";
import { formatTime, plural, REPORT_REASONS } from "@/lib/format";

const STATUSES: { value: ReportStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

/** Pending oldest first, so nothing waits forever; closed ones newest first. */
export function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus>("pending");
  const reports = useReports(status);
  const items = reports.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Segmented<ReportStatus> id="report-status" options={STATUSES} value={status} onChange={setStatus} />

      {reports.isPending && <Spinner className="mx-auto size-8" />}
      <ErrorText>{reports.error && errorMessage(reports.error)}</ErrorText>
      {reports.data && items.length === 0 && (
        <p className="py-8 text-center text-zinc-500">{status === "pending" ? "Nothing to review. 🎉" : "None yet."}</p>
      )}

      {items.map((report, index) => (
        <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
          <Link href={`/admin/report?id=${report.id}`}>
            <Card className="flex items-center gap-3 py-4 transition-colors hover:border-white/15">
              <div className="flex-1">
                <p className="font-semibold">{REPORT_REASONS[report.reason]}</p>
                <p className="text-sm text-zinc-400">
                  @{report.reported.username}
                  {report.reported.status !== "active" && <span className="ml-2 text-red-400">{report.reported.status}</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  by @{report.reporter.username} · {formatTime(report.createdAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  report.reported.reportCount > 1 ? "bg-red-500/15 text-red-300" : "bg-white/5 text-zinc-400"
                }`}
              >
                {plural(report.reported.reportCount, "report")}
              </span>
              {report.action && <span className="text-xs text-zinc-500">{report.action}</span>}
              <span className="text-zinc-600">›</span>
            </Card>
          </Link>
        </motion.div>
      ))}

      {reports.hasNextPage && (
        <Button variant="secondary" disabled={reports.isFetchingNextPage} onClick={() => void reports.fetchNextPage()}>
          {reports.isFetchingNextPage ? <Spinner /> : "Show more"}
        </Button>
      )}
    </div>
  );
}
