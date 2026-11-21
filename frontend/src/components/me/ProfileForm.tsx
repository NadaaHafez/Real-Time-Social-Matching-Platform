"use client";

import {
  COUNTRIES,
  genderSchema,
  profileFieldsSchema,
  type Profile,
  type UpdateProfileRequest,
} from "@social-matching/shared";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useForm, type DefaultValues } from "react-hook-form";
import { z } from "zod";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Field, Input, Select, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { sharedResolver } from "@/lib/forms";

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));

/**
 * The shared field rules, plus one form-only step: an empty ice breaker box means "clear it",
 * which the API spells `null`.
 */
const formSchema = profileFieldsSchema.extend({
  iceBreaker: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    profileFieldsSchema.shape.iceBreaker,
  ),
});

type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const defaultsFrom = (profile: Profile): DefaultValues<FormInput> => ({
  age: profile.age ?? undefined,
  gender: profile.gender ?? undefined,
  country: profile.country ?? undefined,
  iceBreaker: profile.iceBreaker ?? "",
});

export function ProfileForm({ profile }: { profile: Profile }) {
  const { setProfile } = useSession();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: sharedResolver(formSchema),
    defaultValues: defaultsFrom(profile),
  });

  const save = useMutation({
    mutationFn: (patch: UpdateProfileRequest) => api.patch<Profile>("/me/profile", patch),
    onSuccess: (updated) => {
      setProfile(updated);
      reset(defaultsFrom(updated));
    },
  });

  /** Only what changed: the API takes a partial update. */
  function submit(values: FormOutput) {
    const patch: UpdateProfileRequest = {};
    if (values.age !== profile.age) patch.age = values.age;
    if (values.gender !== profile.gender) patch.gender = values.gender;
    if (values.country !== profile.country) patch.country = values.country;
    if (values.iceBreaker !== profile.iceBreaker) patch.iceBreaker = values.iceBreaker;

    if (Object.keys(patch).length > 0) save.mutate(patch);
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(submit)} noValidate>
        <h2 className="text-lg font-semibold">Profile</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age" error={errors.age?.message}>
            <Input type="number" inputMode="numeric" aria-invalid={!!errors.age} {...register("age", { valueAsNumber: true })} />
          </Field>
          <Field label="Gender" error={errors.gender?.message}>
            <Select aria-invalid={!!errors.gender} {...register("gender")}>
              {genderSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Country" error={errors.country?.message}>
          <Select aria-invalid={!!errors.country} {...register("country")}>
            {SORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ice breaker" error={errors.iceBreaker?.message}>
          <Input
            aria-invalid={!!errors.iceBreaker}
            placeholder="An opening line, ready in every new chat"
            {...register("iceBreaker")}
          />
        </Field>

        <AnimatePresence>
          {isDirty && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Button type="submit" className="w-full" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : "Save profile"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <ErrorText>{save.error && errorMessage(save.error)}</ErrorText>
      </form>
    </Card>
  );
}
