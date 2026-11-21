"use client";

import { appSettingsSchema, type AppSettings, type UpdateSettingsRequest } from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type DefaultValues } from "react-hook-form";
import { z } from "zod";

import { Button, Card, ErrorText, Field, Input, Spinner } from "@/components/ui";
import { adminKeys, useAppSettings } from "@/lib/adminQueries";
import { api, errorMessage } from "@/lib/api";
import { listError, sharedResolver } from "@/lib/forms";
import { keys } from "@/lib/queries";

/** The shared rules, plus one form-only step: streak rewards are typed as "1, 1, 3". */
const formSchema = appSettingsSchema.extend({
  streakRewards: z.preprocess(
    (value) => (typeof value === "string" ? value.split(",").map((part) => Number(part.trim())) : value),
    appSettingsSchema.shape.streakRewards,
  ),
});

type FormInput = Omit<z.input<typeof formSchema>, "streakRewards"> & { streakRewards: string };
type NumberField = Exclude<keyof AppSettings, "streakRewards">;

const GROUPS: { title: string; fields: [NumberField, string][] }[] = [
  {
    title: "Rolls",
    fields: [
      ["baseRollCost", "Base roll cost"],
      ["ageFilterCost", "+ age filter"],
      ["genderFilterCost", "+ gender filter"],
      ["countryFilterCost", "+ country filter"],
      ["welcomeRolls", "Welcome Rolls"],
    ],
  },
  {
    title: "Country slots",
    fields: [
      ["freeIncludeSlots", "Free include"],
      ["freeExcludeSlots", "Free exclude"],
      ["includeSlotPrice", "Include slot price"],
      ["excludeSlotPrice", "Exclude slot price"],
      ["maxExtraIncludeSlots", "Max extra include"],
      ["maxExtraExcludeSlots", "Max extra exclude"],
    ],
  },
  {
    title: "Matching and safety",
    fields: [
      ["minimumAge", "Minimum age"],
      ["matchTimeoutSeconds", "Search timeout (s)"],
      ["blockHours", "Block after report (h)"],
    ],
  },
];

const defaultsFrom = (settings: AppSettings): DefaultValues<FormInput> => ({
  ...settings,
  streakRewards: settings.streakRewards.join(", "),
});

export function SettingsTab() {
  const settings = useAppSettings();
  if (!settings.data) return <Spinner className="mx-auto size-8" />;
  return <SettingsForm settings={settings.data} />;
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FormInput, unknown, AppSettings>({
    resolver: sharedResolver(formSchema),
    defaultValues: defaultsFrom(settings),
  });

  const save = useMutation({
    mutationFn: (patch: UpdateSettingsRequest) => api.patch<AppSettings>("/admin/settings", patch),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.settings, saved);
      reset(defaultsFrom(saved));
      // Prices and slots on every screen read from these.
      void queryClient.invalidateQueries({ queryKey: keys.filters });
      void queryClient.invalidateQueries({ queryKey: ["rolls"] });
    },
  });

  /** Only the changed settings, so one owner's save never overwrites another's. */
  function submit(values: AppSettings) {
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => [key, values[key as keyof AppSettings]]),
    ) as UpdateSettingsRequest;
    save.mutate(patch);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(submit)} noValidate>
      {GROUPS.map((group) => (
        <Card key={group.title} className="flex flex-col gap-3">
          <h2 className="font-semibold">{group.title}</h2>
          <div className="grid grid-cols-2 gap-3">
            {group.fields.map(([name, label]) => (
              <Field key={name} label={label} error={errors[name]?.message}>
                <Input type="number" inputMode="numeric" aria-invalid={!!errors[name]} {...register(name, { valueAsNumber: true })} />
              </Field>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <Field label="Streak rewards, day 1 first" error={listError(errors.streakRewards, "Day")}>
          <Input aria-invalid={!!errors.streakRewards} {...register("streakRewards")} />
        </Field>
      </Card>

      {isDirty && (
        <div className="sticky bottom-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => reset(defaultsFrom(settings))}>
            Undo
          </Button>
          <Button type="submit" className="flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : "Save settings"}
          </Button>
        </div>
      )}
      <ErrorText>{save.error && errorMessage(save.error)}</ErrorText>
      {save.isSuccess && !isDirty && <p className="text-center text-sm text-emerald-400">Saved. Applies from the next request.</p>}
    </form>
  );
}
