/**
 * Auth placeholder for Phase 1.
 * Replace with NextAuth, Clerk, or custom JWT in production.
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "PLANNER" | "VIEWER";
};

const PLACEHOLDER_USER: SessionUser = {
  id: "placeholder-user",
  email: "planner@guard.local",
  name: "Planning Manager",
  role: "ADMIN",
};

export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

export async function getSession(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) {
    return PLACEHOLDER_USER;
  }

  // TODO: Implement real session lookup (cookies, JWT, etc.)
  return PLACEHOLDER_USER;
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
