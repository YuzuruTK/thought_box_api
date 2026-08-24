/**
 * Human-friendly messages for HTTP status codes returned by the API.
 * The server's own `error` message is preferred when present; these are
 * fallbacks so raw responses or stack traces are never surfaced to users.
 */
const STATUS_MESSAGES: Record<number, string> = {
  400: "That request was invalid. Please check your input and try again.",
  401: "Your session has expired. Please log in again.",
  404: "That item no longer exists.",
  409: "That item already exists.",
  500: "Something went wrong on our end. Please try again.",
  502: "The AI provider could not be reached. Please try again in a moment.",
  504: "The AI request took too long. Please try again in a moment.",
};

export function friendlyMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? "Something went wrong. Please try again.";
}
