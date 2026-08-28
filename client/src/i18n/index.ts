/**
 * i18n foundation (Issue #21, Phase 1).
 *
 * English is the default and fallback language; additional locales are
 * registered here as they are added (pt-BR arrives in Phase 2). Resources
 * are bundled JSON imports — no network fetching, so the correct strings
 * are available on first paint.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = "en";

void i18next.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "common",
  ns: ["common"],
  // React already escapes rendered strings; double-escaping would show HTML entities.
  interpolation: { escapeValue: false },
});

export default i18next;
