"use client";

import {
  moderationActionSchema,
  resolveReportRequestSchema,
  type ModerationAction,
  type ReportDetail,
  type ResolveReportRequest,
} from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";

import { useAdminGuard } from "@/components/admin/useAdminGuard";
import { Button, Card, ErrorText, Field, Loading, Screen, Segmented, Spinner, Textarea } from "@/components/ui";
import { adminKeys, useReport } from "@/lib/adminQueries";
import { api, errorMessage } from "@/lib/api";
import { formatTime, plural, REPORT_REASONS } from "@/lib/format";
import { sharedResolver } from "@/lib/forms";

const ACTIONS = moderationActionSchema.options.map((value) => ({ value, label: value }));
const DAYS = [
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

// A static export cannot have /admin/reports/[id], so the id travels as ?id=.
export default function ReportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReportScreen />
    </Suspense>
  );
}

function ReportScreen() {
  const role = useAdminGuard("moderator");
  const id = useSearchParams().get("id");
  const report = useReport(role ? id : null);
  const router = useRouter();

  if (!role || report.isPending) return <Loading />;

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Button variant="ghost" className="px-2" onClick={() => router.back()} aria-label="Back">
          ←
        </Button>
        <h1 className="text-2xl font-bold">Report</h1>
      </header>

      <ErrorText>{report.error && errorMessage(report.error)}</ErrorText>
      {report.data && <ReportView report={report.data} />}
    </Screen>
  );
}

function ReportView({ report }: { report: ReportDetail }) {
  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="text-lg font-semibold">{REPORT_REASONS[report.reason]}</p>
        <p className="text-sm text-zinc-400">
          @{report.reporter.username} reported <span className="font-semibold text-zinc-200">@{report.reported.username}</span>
          {" · "}
          {formatTime(report.createdAt)}
        </p>
        <p className="text-sm">
          <span className={report.reported.reportCount > 1 ? "text-red-300" : "text-zinc-400"}>
            {plural(report.reported.reportCount, "report")} against them in total
          </span>
          {report.reported.status !== "active" && <span className="ml-2 text-red-400">· now {report.reported.status}</span>}
        </p>
        {report.note && <p className="rounded-2xl bg-black/30 p-3 text-sm text-zinc-300">“{report.note}”</p>}
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">The chat&apos;s last messages, frozen when it was reported</p>
        {report.messages.length === 0 && <p className="text-sm text-zinc-500">No messages were sent.</p>}
        {report.messages.map((message, index) => (
          <p
            key={index}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              message.from === "reporter" ? "self-end bg-white/10" : "self-start bg-red-500/15 text-red-100"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wide opacity-60">{message.from}</span>
            {message.body}
          </p>
        ))}
      </Card>

      {report.review ? (
        <Card>
          <p className="font-semibold">Closed: {report.action}</p>
          <p className="text-sm text-zinc-400">
            by @{report.review.by} · {formatTime(report.review.at)}
          </p>
          {report.review.note && <p className="mt-2 text-sm text-zinc-300">{report.review.note}</p>}
        </Card>
      ) : (
        <ResolveForm reportId={report.id} />
      )}
    </>
  );
}

/** Validated by the same schema the backend uses, including "suspendDays only with suspend". */
function ResolveForm({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ResolveReportRequest>({ resolver: sharedResolver(resolveReportRequestSchema) });

  const action = watch("action");
  const days = watch("suspendDays");

  const resolve = useMutation({
    mutationFn: (values: ResolveReportRequest) => api.post<ReportDetail>(`/admin/reports/${reportId}/resolve`, values),
    onSuccess: (closed) => {
      queryClient.setQueryData(adminKeys.report(reportId), closed);
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    },
  });

  function chooseAction(next: ModerationAction) {
    setValue("action", next, { shouldValidate: false });
    // Only a suspension takes a length; any other action must not send one.
    if (next !== "suspend") setValue("suspendDays", undefined);
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => resolve.mutate(values))} noValidate>
        <h2 className="text-lg font-semibold">Decision</h2>
        <Segmented<ModerationAction> id="action" options={ACTIONS} value={action ?? null} onChange={chooseAction} />
        {errors.action && <p className="text-sm text-red-400">{errors.action.message}</p>}

        {action === "suspend" && (
          <Field label="For" group error={errors.suspendDays?.message}>
            <Segmented
              id="days"
              options={DAYS}
              value={days ? String(days) : null}
              onChange={(value) => setValue("suspendDays", Number(value) as 1 | 7 | 30, { shouldValidate: true })}
            />
          </Field>
        )}

        <Field label="Note for the record (optional)" error={errors.note?.message}>
          <Textarea rows={2} {...register("note", { setValueAs: (v: string) => (v?.trim() ? v : undefined) })} />
        </Field>

        <Button type="submit" variant={action === "ban" || action === "suspend" ? "danger" : "primary"} disabled={resolve.isPending}>
          {resolve.isPending ? <Spinner /> : action ? `Confirm: ${action}` : "Choose a decision"}
        </Button>
        <ErrorText>{resolve.error && errorMessage(resolve.error)}</ErrorText>
      </form>
    </Card>
  );
}
