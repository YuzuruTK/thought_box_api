import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as api from "../../services/api";

interface AuthContextValue {
  /** JWT for the current session, or null when logged out. */
  token: string | null;
  userId: number | null;
  login(email: string, password: string): Promise<void>;
  /** Registers a new account and immediately signs in. */
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_ID_KEY = "thoughtbox_user_id";

function readStoredUserId(): number | null {
  const raw = localStorage.getItem(USER_ID_KEY);
  const id = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => api.getStoredToken());
  const [userId, setUserId] = useState<number | null>(readStoredUserId);

  const applySession = useCallback((newToken: string, newUserId: number) => {
    api.storeToken(newToken);
    localStorage.setItem(USER_ID_KEY, String(newUserId));
    setToken(newToken);
    setUserId(newUserId);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      applySession(res.token, res.userId);
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      // New accounts are signed in immediately after registration.
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    api.storeToken(null);
    localStorage.removeItem(USER_ID_KEY);
    setToken(null);
    setUserId(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, userId, login, register, logout }),
    [token, userId, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
