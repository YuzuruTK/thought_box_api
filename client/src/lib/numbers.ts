import i18next from "../i18n";

/**
 * Locale-aware number formatting (Issue #21, Phase 4).
 *
 * The locale is derived from the active i18next language — there is no
 * duplicated locale state. Used for all user-facing numeric values
 * (thought counts, cooldown minutes, etc.).
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(i18next.language || "en", options).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, options).format(value);
  }
}
