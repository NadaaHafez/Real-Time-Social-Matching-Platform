import type { UserRole } from "@social-matching/shared";

/** The minimum carried on an authenticated request. Anything else is read from the database. */
export interface CurrentUser {
  id: string;
  piUserId: string;
  username: string;
  /** Read fresh on every request, so a demotion applies immediately. */
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser. Absent on public routes. */
      currentUser?: CurrentUser;
    }
  }
}
