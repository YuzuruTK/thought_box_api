import i18next from "../i18n";

/**
 * Locale-aware date formatting (Issue #21, Phase 4).
 *
 * The locale is derived from the active i18next language — there is no
 * duplicated locale state. Dates follow the conventions of the selected
 * UI language (e.g. "Aug 24" in English, "24 de ago." in pt-BR).
 */

function locale(): string {
  const language = i18next.language;
  return language || "en";
}

function format(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  constructor: typeof Intl.DateTimeFormat = Intl.DateTimeFormat,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new constructor(locale(), options).format(date);
  } catch {
    // Unsupported locale tag — fall back to the runtime default.
    return new constructor(undefined, options).format(date);
  }
}

/** "Aug 24" / "24 de ago." */
export function formatShortDate(iso: string): string {
  return format(iso, { month: "short", day: "numeric" });
}

/** "Aug 24, 2:35 PM" / "24 de ago. 14:35" */
export function formatTimestamp(iso: string): string {
  return format(iso, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2:35 PM" / "14:35" */
export function formatTime(iso: string): string {
  return format(iso, { hour: "2-digit", minute: "2-digit" });
}
