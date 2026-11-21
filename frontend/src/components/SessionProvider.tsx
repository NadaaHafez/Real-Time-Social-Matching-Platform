"use client";

import type { PaymentReceipt, Profile, SignInResponse } from "@social-matching/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { api, refreshTokens, setTokens } from "@/lib/api";
import { authenticateWithPi } from "@/lib/pi";
import { connectSocket, type AppSocket } from "@/lib/socket";

type Status = "loading" | "signedOut" | "signedIn";

interface Session {
  status: Status;
  profile: Profile | null;
  socket: AppSocket | null;
  setProfile: (profile: Profile) => void;
  signInWithPi: () => Promise<void>;
  devSignIn: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socket, setSocket] = useState<AppSocket | null>(null);

  // Pi reports unfinished payments during authenticate(), before we have our own tokens.
  const pendingPayments = useRef<string[]>([]);

  const finishSignIn = useCallback(async () => {
    setProfile(await api.get<Profile>("/me/profile"));
    setStatus("signedIn");

    for (const paymentId of pendingPayments.current.splice(0)) {
      // Settles it: credits the Rolls if it was signed, cancels it if not.
      await api.post<PaymentReceipt>("/payments/complete", { paymentId }).catch(() => undefined);
    }
  }, []);

  // A reload keeps the session: the refresh token survives in sessionStorage.
  useEffect(() => {
    refreshTokens()
      .then((ok) => (ok ? finishSignIn() : setStatus("signedOut")))
      .catch(() => setStatus("signedOut"));
  }, [finishSignIn]);

  // One socket per signed-in session.
  useEffect(() => {
    if (status !== "signedIn") return;

    const connection = connectSocket();
    setSocket(connection);

    return () => {
      connection.close();
      setSocket(null);
    };
  }, [status]);

  const signInWithPi = useCallback(async () => {
    const authResult = await authenticateWithPi((paymentId) => pendingPayments.current.push(paymentId));
    const { tokens } = await api.public<SignInResponse>("/auth/signin", { authResult });
    setTokens(tokens);
    await finishSignIn();
  }, [finishSignIn]);

  const devSignIn = useCallback(
    async (username: string) => {
      const { tokens } = await api.public<SignInResponse>("/dev/signin", { username });
      setTokens(tokens);
      await finishSignIn();
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    const refreshToken = sessionStorage.getItem("refreshToken");
    if (refreshToken) await api.public("/auth/signout", { refreshToken }).catch(() => undefined);

    setTokens(null);
    setProfile(null);
    setStatus("signedOut");
  }, []);

  return (
    <SessionContext.Provider value={{ status, profile, socket, setProfile, signInWithPi, devSignIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
