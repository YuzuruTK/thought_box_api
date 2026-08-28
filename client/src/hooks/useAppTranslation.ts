import { useTranslation } from "react-i18next";

/**
 * Thin wrapper around `useTranslation` pinned to the app's default
 * ("common") namespace, so call sites never repeat the namespace.
 */
export function useAppTranslation() {
  return useTranslation("common");
}
