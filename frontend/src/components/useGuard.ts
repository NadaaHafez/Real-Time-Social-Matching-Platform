"use client";

import type { Profile } from "@social-matching/shared";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "./SessionProvider";

type Page = "signin" | "onboarding" | "app";

/** Where a signed-in user belongs: onboarding until the profile and terms are done. */
function pageFor(profile: Profile): Page {
  return profile.isNewUser || profile.needsTermsAcceptance ? "onboarding" : "app";
}

const PATHS: Record<Page, string> = { signin: "/", onboarding: "/onboarding", app: "/home" };

/** Redirects to the right screen. Returns true once this page may render. */
export function useGuard(page: Page): boolean {
  const { status, profile } = useSession();
  const router = useRouter();

  let belongsOn: Page | null = null;
  if (status === "signedOut") belongsOn = "signin";
  if (status === "signedIn" && profile) belongsOn = pageFor(profile);

  const redirect = belongsOn && belongsOn !== page ? PATHS[belongsOn] : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  return belongsOn === page;
}
