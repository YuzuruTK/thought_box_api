/**
 * i18n foundation (Issue #21, Phase 1) with language selection (Phase 3).
 *
 * Resources are bundled JSON imports — no network fetching, so the correct
 * strings are available on first paint. The startup language resolves in
 * this order:
 *   1. saved user preference (localStorage["thoughtbox_locale"])
 *   2. browser language (navigator.languages, e.g. "pt" -> "pt-BR")
 *   3. English fallback
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import ptBrCommon from "./locales/pt-BR/common.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = "en";

export const STORAGE_KEY = "thoughtbox_locale";

/** Read the persisted preference, if any, ignoring unknown values. */
export function readStoredLanguage(): AppLanguage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)) {
      return raw as AppLanguage;
    }
  } catch {
    // localStorage unavailable — fall through to browser detection.
  }
  return null;
}

/** Map a browser language tag to a supported language, or null. */
export function mapBrowserLanguage(tag: string): AppLanguage | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR"; // pt, pt-BR, pt-PT -> pt-BR
  if (lower.startsWith("en")) return "en"; // en, en-US, en-GB -> en
  return null;
}

/** Resolve the startup language: saved preference, then browser, then en. */
export function resolveInitialLanguage(): AppLanguage {
  const saved = readStoredLanguage();
  if (saved) return saved;
  if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
    for (const tag of navigator.languages) {
      const mapped = mapBrowserLanguage(tag);
      if (mapped) return mapped;
    }
  }
  return DEFAULT_LANGUAGE;
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    "pt-BR": { common: ptBrCommon },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "common",
  ns: ["common"],
  // React already escapes rendered strings; double-escaping would show HTML entities.
  interpolation: { escapeValue: false },
});

export default i18next;

