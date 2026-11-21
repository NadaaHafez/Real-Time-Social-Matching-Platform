"use client";

import {
  legalDocumentTypeSchema,
  publishLegalRequestSchema,
  type LegalDocument,
  type LegalDocumentType,
  type PublishLegalRequest,
} from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button, Card, ErrorText, Field, Input, Segmented, Spinner, Textarea, Toggle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { sharedResolver } from "@/lib/forms";
import { keys, useLegal } from "@/lib/queries";

const TYPES = legalDocumentTypeSchema.options.map((value) => ({ value, label: value === "terms" ? "Terms" : "Privacy" }));

/** Publishing adds the next revision: published text is never edited. */
export function LegalTab() {
  const queryClient = useQueryClient();
  const legal = useLegal();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PublishLegalRequest>({
    resolver: sharedResolver(publishLegalRequestSchema),
    defaultValues: { type: "terms", title: "", content: "", requiresReaccept: false },
  });

  const type = watch("type");
  const current = legal.data?.[type];

  const publish = useMutation({
    mutationFn: (values: PublishLegalRequest) => api.post<LegalDocument>("/admin/legal", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.legal });
      void queryClient.invalidateQueries({ queryKey: keys.profile });
      reset({ type, title: "", content: "", requiresReaccept: false });
    },
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => publish.mutate(values))} noValidate>
      <Segmented<LegalDocumentType>
        id="legal-type"
        options={TYPES}
        value={type}
        onChange={(next) => {
          setValue("type", next);
          // Only terms can ask everyone to accept again.
          if (next === "privacy") setValue("requiresReaccept", false);
        }}
      />

      <p className="text-sm text-zinc-500">
        {current ? `Current: v${current.revision}, “${current.title}”. Publishing creates v${current.revision + 1}.` : "Nothing published yet. This will be v1."}
      </p>

      <Card className="flex flex-col gap-3">
        <Field label="Title" error={errors.title?.message}>
          <Input aria-invalid={!!errors.title} {...register("title")} />
        </Field>
        <Field label="Content (Markdown)" error={errors.content?.message}>
          <Textarea rows={10} aria-invalid={!!errors.content} {...register("content")} />
        </Field>
        {type === "terms" && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-400">Ask everyone to accept again before their next roll. Leave off for a wording fix.</span>
            <Toggle
              checked={!!watch("requiresReaccept")}
              onChange={(on) => setValue("requiresReaccept", on)}
              label="Require accepting again"
            />
          </div>
        )}
      </Card>

      <Button type="submit" disabled={publish.isPending}>
        {publish.isPending ? <Spinner /> : `Publish ${type === "terms" ? "terms" : "privacy policy"}`}
      </Button>
      <ErrorText>{publish.error && errorMessage(publish.error)}</ErrorText>
      {publish.isSuccess && <p className="text-center text-sm text-emerald-400">Published.</p>}
    </form>
  );
}
