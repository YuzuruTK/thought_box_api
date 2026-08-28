import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import i18next from "../i18n";
import type { AppLanguage } from "../i18n";
import { SUPPORTED_LANGUAGES, readStoredLanguage, STORAGE_KEY } from "../i18n";

/**
 * Language system (Issue #21, Phase 3).
 *
 * Mirrors ThemeContext: the user's choice persists in localStorage
 * (not the backend) so it applies before login and without a network
 * round-trip. Switching calls i18n.changeLanguage() so all translation
 * consumers re-render, and keeps <html lang> in sync for accessibility
 * and browser language negotiation.
 */

const LANGUAGES: AppLanguage[] = [...SUPPORTED_LANGUAGES];

export { SUPPORTED_LANGUAGES };
export type { AppLanguage };

interface LanguageContextValue {
  /** Currently active language. */
  language: AppLanguage;
  setLanguage(language: AppLanguage): void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // i18n/index.ts already resolved saved -> browser -> en at init time;
  // hydrate React state from the same source to avoid a mismatch.
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const current = i18next.language;
    return (LANGUAGES as string[]).includes(current) ? (current as AppLanguage) : "en";
  });

  // Keep <html lang> in sync (initial render included).
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: AppLanguage) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the language still applies for this session.
    }
    void i18next.changeLanguage(next);
    setLanguageState(next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider.");
  }
  return ctx;
}

// Re-exported for consumers that only need storage inspection in tests.
export { readStoredLanguage };
