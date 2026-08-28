import i18next from "../i18n";

/**
 * Human-friendly messages for HTTP status codes returned by the API.
 * The server's own `error` message is preferred when present; these are
 * translated fallbacks so raw responses or stack traces are never surfaced
 * to users.
 */
export function friendlyMessage(status: number): string {
  return i18next.t(`errors.${status}`, {
    defaultValue: i18next.t("common.genericError"),
  });
}
