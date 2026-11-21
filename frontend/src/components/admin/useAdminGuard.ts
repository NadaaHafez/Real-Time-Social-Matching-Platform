"use client";

import type { UserRole } from "@social-matching/shared";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAdminRole } from "@/lib/adminQueries";

import { useGuard } from "../useGuard";

const RANK: Record<UserRole, number> = { user: 0, moderator: 1, owner: 2 };

/**
 * The caller's staff role once it meets `minimum`, else null while loading. Anyone below it
 * is sent back to /me. The backend checks every admin call anyway: this only hides screens.
 */
export function useAdminGuard(minimum: Exclude<UserRole, "user">): UserRole | null {
  const ready = useGuard("app");
  const role = useAdminRole(ready);
  const router = useRouter();

  const allowed = role.data ? RANK[role.data] >= RANK[minimum] : false;
  const refused = role.isSuccess && !allowed;

  useEffect(() => {
    if (refused) router.replace("/me");
  }, [refused, router]);

  return allowed ? role.data! : null;
}
