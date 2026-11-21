"use client";

import { reportReasonSchema, reportRequestSchema } from "@social-matching/shared";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Sheet } from "@/components/Sheet";
import { Button, ErrorText, Field, Spinner, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { REPORT_REASONS } from "@/lib/format";
import { sharedResolver } from "@/lib/forms";

/** The request minus the session, which this sheet already knows. */
const formSchema = reportRequestSchema.omit({ sessionId: true });
type ReportForm = z.infer<typeof formSchema>;

export function ReportSheet({
  sessionId,
  partnerName,
  open,
  onClose,
  onReported,
}: {
  sessionId: string;
  partnerName: string;
  open: boolean;
  onClose: () => void;
  onReported: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ReportForm>({ resolver: sharedResolver(formSchema) });

  const report = useMutation({
    mutationFn: (values: ReportForm) => api.post("/chat/report", { sessionId, ...values }),
    onSuccess: onReported,
  });

  const chosen = watch("reason");

  return (
    <Sheet open={open} onClose={onClose} title={`Report ${partnerName}`}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => report.mutate(values))} noValidate>
        <p className="text-sm text-zinc-400">
          This ends the chat, and you won&apos;t be matched again for a while. A moderator will see the last messages.
        </p>

        <div className="flex flex-col gap-2" role="radiogroup">
          {reportReasonSchema.options.map((reason) => (
            <label
              key={reason}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                chosen === reason ? "border-brand bg-brand/10" : "border-white/10 hover:bg-white/5"
              }`}
            >
              <input type="radio" value={reason} className="accent-[var(--color-brand)]" {...register("reason")} />
              {REPORT_REASONS[reason]}
            </label>
          ))}
          {errors.reason && <p className="text-sm text-red-400">{errors.reason.message}</p>}
        </div>

        <Field label="Anything else? (optional)" error={errors.note?.message}>
          <Textarea
            rows={3}
            {...register("note", { setValueAs: (value: string) => (value.trim() === "" ? undefined : value) })}
          />
        </Field>

        <Button type="submit" variant="danger" disabled={report.isPending}>
          {report.isPending ? <Spinner /> : "Report and leave"}
        </Button>
        <ErrorText>{report.error && errorMessage(report.error)}</ErrorText>
      </form>
    </Sheet>
  );
}
