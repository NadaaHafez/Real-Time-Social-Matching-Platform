"use client";

import { motion } from "motion/react";
import { useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { Button, Card, ErrorText, Field, Input, Loading, Screen, Spinner } from "@/components/ui";
import { useGuard } from "@/components/useGuard";
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
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;

  return (
    <Screen>
      <div className="mt-20 flex flex-col items-center gap-4 text-center">
        <motion.div
          className="size-24 rounded-full bg-gradient-to-br from-brand via-brand-deep to-accent shadow-2xl shadow-brand/40"
          animate={{ scale: [1, 1.06, 1], rotate: [0, 8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <h1 className="text-5xl font-black tracking-tight">Roll</h1>
        <p className="max-w-64 text-zinc-400">Meet someone new, one chat at a time.</p>
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <Button disabled={busy} onClick={() => run(signInWithPi)}>
          {busy ? <Spinner /> : "Sign in with Pi"}
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
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" />
              </Field>
              <Button type="submit" variant="secondary" disabled={busy || username.length < 3}>
                Sign in as test user
              </Button>
            </form>
          </Card>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Screen>
  );
}
