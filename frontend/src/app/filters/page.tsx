"use client";

import {
  COUNTRIES,
  genderSchema,
  updateFiltersRequestSchema,
  type BuySlotResponse,
  type CountryCode,
  type CountryMode,
  type FilterState,
  type Gender,
  type UpdateFiltersRequest,
} from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useForm } from "react-hook-form";

import { Button, Card, ErrorText, Field, Input, Loading, Screen, Segmented, Select, Spinner, Toggle } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, errorMessage } from "@/lib/api";
import { countryFlag, plural } from "@/lib/format";
import { sharedResolver } from "@/lib/forms";
import { keys, useFilters } from "@/lib/queries";

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));
const GENDERS = genderSchema.options.map((value) => ({ value, label: value }));
const MODES: { value: CountryMode; label: string }[] = [
  { value: "include", label: "Only these" },
  { value: "exclude", label: "Anyone but these" },
];

export default function FiltersPage() {
  const ready = useGuard("app");
  const filters = useFilters(ready);

  if (!ready || !filters.data) return <Loading />;

  // Mounted once the saved filters are here, so the form starts from them.
  return <FiltersForm state={filters.data} />;
}

function FiltersForm({ state }: { state: FilterState }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateFiltersRequest>({
    // The same schema the backend validates PUT /me/filters with, min ≤ max rule included.
    resolver: sharedResolver(updateFiltersRequestSchema),
    defaultValues: state.filters,
  });

  const values = watch();
  const mode = values.country.mode;
  const list = values.country[mode];
  const slots = state.slots[mode];
  const limit = slots.free + slots.bought;

  const set = <P extends Parameters<typeof setValue>[0]>(path: P, value: Parameters<typeof setValue<P>>[1]) =>
    setValue(path, value, { shouldDirty: true, shouldValidate: true });

  const save = useMutation({
    mutationFn: (next: UpdateFiltersRequest) => api.put<FilterState>("/me/filters", next),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.filters, saved);
      reset(saved.filters);
    },
  });

  const buySlot = useMutation({
    mutationFn: () => api.post<BuySlotResponse>("/me/filters/slots", { mode, slot: slots.bought + 1, price: slots.price }),
    onSuccess: ({ state: updated, balance }) => {
      // Only the slots: unsaved edits in the form stay as they are.
      queryClient.setQueryData(keys.filters, updated);
      queryClient.setQueryData(keys.balance, balance);
    },
  });

  return (
    <Screen nav>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Filters</h1>
          <p className="text-zinc-500">Matching is mutual: you both fit each other&apos;s.</p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <p className="text-sm text-zinc-500">Next roll</p>
          <p className="text-2xl font-black">{plural(state.rollCost, "Roll")}</p>
        </div>
      </header>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit((next) => save.mutate(next))} noValidate>
        <FilterCard title="Age" enabled={values.age.enabled} onToggle={(on) => set("age.enabled", on)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" error={errors.age?.min?.message}>
              <Input type="number" inputMode="numeric" aria-invalid={!!errors.age?.min} {...register("age.min", { valueAsNumber: true })} />
            </Field>
            <Field label="To" error={errors.age?.max?.message}>
              <Input type="number" inputMode="numeric" aria-invalid={!!errors.age?.max} {...register("age.max", { valueAsNumber: true })} />
            </Field>
          </div>
        </FilterCard>

        <FilterCard title="Gender" enabled={values.gender.enabled} onToggle={(on) => set("gender.enabled", on)}>
          <Segmented<Gender> id="gender" options={GENDERS} value={values.gender.value} onChange={(g) => set("gender.value", g)} />
          {values.gender.enabled && !values.gender.value && (
            <p className="text-sm text-zinc-500">Pick one, or this filter stays off.</p>
          )}
        </FilterCard>

        <FilterCard title="Country" enabled={values.country.enabled} onToggle={(on) => set("country.enabled", on)}>
          <Segmented<CountryMode> id="mode" options={MODES} value={mode} onChange={(m) => set("country.mode", m)} />

          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {list.map((code) => (
                <motion.button
                  key={code}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => set(`country.${mode}`, list.filter((c) => c !== code))}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm"
                >
                  {countryFlag(code)} {code} <span className="text-zinc-500">×</span>
                </motion.button>
              ))}
            </AnimatePresence>
            {list.length === 0 && <p className="text-sm text-zinc-500">No countries yet, so this filter stays off.</p>}
          </div>

          <Select
            value=""
            disabled={list.length >= limit}
            onChange={(e) => set(`country.${mode}`, [...list, e.target.value as CountryCode])}
          >
            <option value="" disabled>
              {list.length >= limit ? "All slots used" : "Add a country…"}
            </option>
            {SORTED_COUNTRIES.filter((c) => !list.includes(c.code)).map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>

          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">
              {list.length} of {limit} slots used
            </span>
            {slots.canBuy > 0 && (
              <Button type="button" variant="secondary" className="px-3 py-1.5 text-sm" disabled={buySlot.isPending} onClick={() => buySlot.mutate()}>
                {buySlot.isPending ? <Spinner className="size-4" /> : `+1 slot · ${plural(slots.price, "Roll")}`}
              </Button>
            )}
          </div>
          <ErrorText>{buySlot.error && errorMessage(buySlot.error)}</ErrorText>
          <ErrorText>{errors.country?.[mode]?.message}</ErrorText>
        </FilterCard>

        <AnimatePresence>
          {isDirty && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="sticky bottom-24 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => reset(state.filters)}>
                Undo
              </Button>
              <Button type="submit" className="flex-1" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : "Save filters"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Rules only the server knows: the minimum age, and how many slots are owned. */}
        <ErrorText>{save.error && errorMessage(save.error)}</ErrorText>
      </form>
    </Screen>
  );
}

function FilterCard({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Toggle checked={enabled} onChange={onToggle} label={`${title} filter`} />
      </div>
      {/* Kept while off, so turning it back on restores the values. */}
      <motion.div animate={{ opacity: enabled ? 1 : 0.35 }} className={`flex flex-col gap-4 ${enabled ? "" : "pointer-events-none"}`}>
        {children}
      </motion.div>
    </Card>
  );
}
