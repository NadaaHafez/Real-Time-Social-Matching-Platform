"use client";

import {
  COUNTRIES,
  genderSchema,
  type Gender,
  type LegalDocuments,
  type Profile,
} from "@social-matching/shared";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Field, inputClass, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { api, errorMessage } from "@/lib/api";

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.label.localeCompare(b.label));

export default function OnboardingPage() {
  const ready = useGuard("onboarding");
  const { profile, setProfile } = useSession();

  // The newest profile from the server, kept here until onboarding is done.
  const [draft, setDraft] = useState<Profile | null>(null);
  const current = draft ?? profile;

  /** The welcome Rolls, then hand the finished profile to the session, which moves on to /home. */
  async function finish(finished: Profile) {
    await api.post("/rolls/welcome").catch(() => undefined);
    setProfile(finished);
  }

  async function afterProfile(updated: Profile) {
    if (updated.needsTermsAcceptance) setDraft(updated);
    else await finish(updated);
  }

  if (!ready || !current) return <Loading />;

  return (
    <Screen>
      <h1 className="text-2xl font-bold">Welcome, @{current.username}</h1>
      {current.isNewUser ? <ProfileStep onSaved={afterProfile} /> : <TermsStep onAccepted={finish} />}
    </Screen>
  );
}

function ProfileStep({ onSaved }: { onSaved: (profile: Profile) => Promise<void> }) {
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSaved(await api.patch<Profile>("/me/profile", { age: Number(age), gender, country }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="text-zinc-400">Matches use these, and so do other people&apos;s filters.</p>

        <Field label="Age">
          <input className={inputClass} type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
        </Field>

        <Field label="Gender">
          <select className={inputClass} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="">Choose…</option>
            {genderSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Country">
          <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Choose…</option>
            {SORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Button disabled={busy || !age || !gender || !country}>{busy ? "Saving…" : "Continue"}</Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

function TermsStep({ onAccepted }: { onAccepted: (profile: Profile) => Promise<void> }) {
  const [documents, setDocuments] = useState<LegalDocuments | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<LegalDocuments>("/legal").then(setDocuments, (err) => setError(errorMessage(err)));
  }, []);

  async function accept(documentId: string) {
    setBusy(true);
    setError(null);
    try {
      await onAccepted(await api.post<Profile>("/me/terms", { documentId }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const terms = documents?.terms;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{terms ? `${terms.title} (v${terms.revision})` : "Terms of use"}</h2>
        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 text-sm text-zinc-300">
          {terms?.content ?? "Loading…"}
        </div>
        <Button disabled={!terms || busy} onClick={() => terms && accept(terms.id)}>
          {busy ? "Saving…" : "I accept"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}
