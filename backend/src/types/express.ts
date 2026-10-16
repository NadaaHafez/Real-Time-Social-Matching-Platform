/** The minimum carried on an authenticated request. Anything else is read from the database. */
export interface CurrentUser {
  id: string;
  piUserId: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser. Absent on public routes. */
      currentUser?: CurrentUser;
    }
  }
}
