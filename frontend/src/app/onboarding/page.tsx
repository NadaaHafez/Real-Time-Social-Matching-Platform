"use client";

import {
  COUNTRIES,
  genderSchema,
  onboardingRequestSchema,
  type OnboardingRequest,
  type Profile,
} from "@social-matching/shared";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Field, Input, Loading, Screen, Select, Spinner } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, errorMessage } from "@/lib/api";
import { sharedResolver } from "@/lib/forms";
import { useLegal } from "@/lib/queries";

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));

export default function OnboardingPage() {
  const ready = useGuard("onboarding");
  const { profile, setProfile } = useSession();

  // Between the two steps, the newest profile stays here, so the guard does not move on early.
  const [draft, setDraft] = useState<Profile | null>(null);
  const current = draft ?? profile;

  /** The welcome Rolls, then the finished profile to the session, which moves on to /home. */
  async function finish(finished: Profile) {
    await api.post("/rolls/welcome").catch(() => undefined);
    setProfile(finished);
  }

  async function afterProfile(updated: Profile) {
    if (updated.needsTermsAcceptance) setDraft(updated);
    else await finish(updated);
  }

  if (!ready || !current) return <Loading />;

  const step = current.isNewUser ? "profile" : "terms";

  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">
          {step === "profile" ? `Hi, @${current.username}` : "One last thing"}
        </h1>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
          {step === "profile" ? <ProfileStep onSaved={afterProfile} /> : <TermsStep onAccepted={finish} />}
        </motion.div>
      </AnimatePresence>
    </Screen>
  );
}

/** Validated by the same schema the backend checks the request with. */
function ProfileStep({ onSaved }: { onSaved: (profile: Profile) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingRequest>({ resolver: sharedResolver(onboardingRequestSchema) });

  const save = useMutation({
    mutationFn: (values: OnboardingRequest) => api.patch<Profile>("/me/profile", values),
    onSuccess: onSaved,
  });

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <p className="text-zinc-400">Matching uses these, and so do other people&apos;s filters.</p>

        <Field label="Age" error={errors.age?.message}>
          <Input
            type="number"
            inputMode="numeric"
            aria-invalid={!!errors.age}
            {...register("age", { valueAsNumber: true })}
          />
        </Field>

        <Field label="Gender" error={errors.gender?.message}>
          <Select aria-invalid={!!errors.gender} defaultValue="" {...register("gender")}>
            <option value="" disabled>
              Choose…
            </option>
            {genderSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Country" error={errors.country?.message}>
          <Select aria-invalid={!!errors.country} defaultValue="" {...register("country")}>
            <option value="" disabled>
              Choose…
            </option>
            {SORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : "Continue"}
        </Button>
        {/* Rules only the server knows, like the minimum age in Settings. */}
        <ErrorText>{save.error && errorMessage(save.error)}</ErrorText>
      </form>
    </Card>
  );
}

function TermsStep({ onAccepted }: { onAccepted: (profile: Profile) => Promise<void> }) {
  const legal = useLegal();
  const terms = legal.data?.terms;

  const accept = useMutation({
    mutationFn: (documentId: string) => api.post<Profile>("/me/terms", { documentId }),
    onSuccess: onAccepted,
    // Newer terms went out while this page was open: show those instead.
    onError: () => void legal.refetch(),
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{terms ? `${terms.title} · v${terms.revision}` : "Terms of use"}</h2>
        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-sm leading-relaxed text-zinc-300">
          {terms?.content ?? "Loading…"}
        </div>
        <Button disabled={!terms || accept.isPending} onClick={() => terms && accept.mutate(terms.id)}>
          {accept.isPending ? <Spinner /> : "I accept"}
        </Button>
        <ErrorText>{accept.error && errorMessage(accept.error)}</ErrorText>
      </div>
    </Card>
  );
}
