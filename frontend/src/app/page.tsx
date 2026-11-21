"use client";

import { useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Field, inputClass, Loading, Screen } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
import { errorMessage } from "@/lib/api";
import { config } from "@/lib/config";

export default function SignInPage() {
  const ready = useGuard("signin");
  const { signInWithPi, devSignIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;

  return (
    <Screen>
      <div className="mt-16 flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-bold">Roll</h1>
        <p className="text-zinc-400">Meet someone new, one chat at a time.</p>
      </div>

      <Button disabled={busy} onClick={() => run(signInWithPi)}>
        {busy ? "Signing in…" : "Sign in with Pi"}
      </Button>

      {config.devSignIn && (
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => devSignIn(username));
            }}
          >
            <Field label="Test user (development only)">
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" />
            </Field>
            <Button variant="secondary" disabled={busy || username.length < 3}>
              Sign in as test user
            </Button>
          </form>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
