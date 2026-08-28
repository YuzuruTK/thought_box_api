import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Theme system (Issue #22).
 *
 * `mode` is the persisted user preference ("system" follows the OS via
 * `prefers-color-scheme`); `resolvedTheme` is what is actually applied.
 * The resolved theme is applied as `data-theme` on <html>, so themes are
 * pure CSS-variable swaps (see client/src/index.css) — no reloads, no
 * component changes.
 *
 * Persistence lives in localStorage (not the backend) because the theme
 * must apply before login and before any network round-trip.
 */

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_KEY = "thoughtbox_theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const MODES: ThemeMode[] = ["system", "light", "dark"];

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw && (MODES as string[]).includes(raw)) return raw as ThemeMode;
  } catch {
    // localStorage unavailable — fall through to default.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(MEDIA_QUERY).matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

interface ThemeContextValue {
  /** Persisted preference: "system" | "light" | "dark". */
  mode: ThemeMode;
  /** Theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline bootstrap script in index.html has already set data-theme;
  // hydrate React state from the same source to avoid a mismatch flash.
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(readStoredMode()));

  // Keep state and document in sync (covers the initial render too, in case
  // the bootstrap script was skipped or localStorage was cleared mid-flight).
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // While in "system" mode, follow live OS theme changes without a reload.
  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setResolvedTheme(resolve("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Persistence is best-effort; the theme still applies for this session.
    }
    setModeState(next);
    setResolvedTheme(resolve(next));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return ctx;
}
