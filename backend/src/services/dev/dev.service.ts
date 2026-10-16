import type { SignInResponse } from "@social-matching/shared";

import { signInAs } from "../auth/auth.service";

// Real Pi uids are UUIDs, so the prefix can never collide with one.
const DEV_UID_PREFIX = "dev-";

/** Signs in as any username, skipping Pi. Only reachable outside production. */
export function devSignIn(username: string): Promise<SignInResponse> {
  return signInAs({ uid: `${DEV_UID_PREFIX}${username}`, username });
}
