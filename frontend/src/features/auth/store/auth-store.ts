import { create } from "zustand";
import type { Admin, Session } from "../schemas/session";

type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

interface AuthState {
  /** Kept in memory only; the refresh cookie restores it after a reload. */
  accessToken: string | null;
  admin: Admin | null;
  status: AuthStatus;
  setSession: (session: Session) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  admin: null,
  status: "unknown",
  setSession: (session) =>
    set({
      accessToken: session.accessToken,
      admin: session.admin,
      status: "authenticated",
    }),
  clear: () =>
    set({ accessToken: null, admin: null, status: "unauthenticated" }),
}));
