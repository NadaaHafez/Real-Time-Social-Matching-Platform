"use client";

import { packIdParamsSchema, savePackRequestSchema, type AdminPack, type SavePackRequest } from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, Card, ErrorText, Field, Input, Spinner, Toggle } from "@/components/ui";
import { adminKeys, useAdminPacks } from "@/lib/adminQueries";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { sharedResolver } from "@/lib/forms";
import { keys } from "@/lib/queries";

/** A new pack also needs its id; an existing one keeps the id it was sold under. */
const newPackSchema = savePackRequestSchema.extend({ id: packIdParamsSchema.shape.packId });
type PackForm = z.infer<typeof newPackSchema>;

const EMPTY: PackForm = { id: "", rolls: 10, priceInPi: 0.01, tag: null, active: true, sortOrder: 10 };

export function PacksTab() {
  const packs = useAdminPacks();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">Packs are never deleted, because purchases point at them. Turn one off to hide it.</p>
      {packs.isPending && <Spinner className="mx-auto size-8" />}

      {packs.data?.map((pack) => (
        <Card key={pack.id} className={`flex flex-col gap-3 ${pack.active ? "" : "opacity-60"}`}>
          <button type="button" className="flex items-center gap-3 text-left" onClick={() => setEditing(editing === pack.id ? null : pack.id)}>
            <div className="flex-1">
              <p className="font-semibold">
                {pack.id} {!pack.active && <span className="text-xs text-zinc-500">(hidden)</span>}
              </p>
              <p className="text-sm text-zinc-400">
                {plural(pack.rolls, "Roll")} · π {pack.priceInPi} {pack.tag && `· ${pack.tag}`}
              </p>
            </div>
            <span className="text-sm text-zinc-500">{editing === pack.id ? "Close" : "Edit"}</span>
          </button>
          <AnimatePresence>
            {editing === pack.id && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <PackEditor pack={pack} onSaved={() => setEditing(null)} />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      ))}

      <Card>
        <h2 className="mb-3 font-semibold">New pack</h2>
        <PackEditor onSaved={() => undefined} />
      </Card>
    </div>
  );
}

function PackEditor({ pack, onSaved }: { pack?: AdminPack; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !pack;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PackForm>({
    // The id rule only matters for a new pack; an existing id is shown, not edited.
    resolver: sharedResolver(isNew ? newPackSchema : savePackRequestSchema.extend({ id: z.string() })),
    defaultValues: pack ?? EMPTY,
  });

  const save = useMutation({
    mutationFn: ({ id, ...body }: PackForm) => api.put<AdminPack>(`/admin/packs/${id}`, body satisfies SavePackRequest),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.packs });
      void queryClient.invalidateQueries({ queryKey: keys.packs });
      if (isNew) reset(EMPTY);
      onSaved();
    },
  });

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
      {isNew && (
        <Field label="Id (sent by the app, never changes)" error={errors.id?.message}>
          <Input placeholder="mega" aria-invalid={!!errors.id} {...register("id")} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rolls" error={errors.rolls?.message}>
          <Input type="number" aria-invalid={!!errors.rolls} {...register("rolls", { valueAsNumber: true })} />
        </Field>
        <Field label="Price (π)" error={errors.priceInPi?.message}>
          <Input type="number" step="any" aria-invalid={!!errors.priceInPi} {...register("priceInPi", { valueAsNumber: true })} />
        </Field>
        <Field label="Tag (optional)" error={errors.tag?.message}>
          <Input placeholder="popular" {...register("tag", { setValueAs: (v: string | null) => (v?.trim() ? v : null) })} />
        </Field>
        <Field label="Order" error={errors.sortOrder?.message}>
          <Input type="number" {...register("sortOrder", { valueAsNumber: true })} />
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">On sale</span>
        <Toggle checked={watch("active")} onChange={(on) => setValue("active", on, { shouldDirty: true })} label="On sale" />
      </div>
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? <Spinner /> : isNew ? "Create pack" : "Save pack"}
      </Button>
      <ErrorText>{save.error && errorMessage(save.error)}</ErrorText>
    </form>
  );
}
