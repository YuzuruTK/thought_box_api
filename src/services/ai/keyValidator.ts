const OPENROUTER_AUTH_URL = "https://openrouter.ai/api/v1/auth/key";
const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 200;

export type KeyValidationResult =
  | { ok: true; key: string }
  | { ok: false; reason: string };

/** Mask a key for display: 'sk-or-v1-…91cd'. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "…";
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

/**
 * Format validation (lenient — OpenRouter controls the real format):
 * must start with "sk-or-" and be within a sane length range.
 */
function looksLikeOpenRouterKey(key: string): boolean {
  const trimmed = key.trim();
  return (
    trimmed.startsWith("sk-or-") &&
    trimmed.length >= MIN_KEY_LENGTH &&
    trimmed.length <= MAX_KEY_LENGTH
  );
}

/**
 * Reusable OpenRouter key validator.
 *
 * Workflow: format check → live test against OpenRouter → caller marks status.
 */
export class OpenRouterKeyValidator {
  /** Validate a submitted key; returns the trimmed key on success. */
  async validate(rawKey: string): Promise<KeyValidationResult> {
    const trimmed = rawKey.trim();
    if (!looksLikeOpenRouterKey(trimmed)) {
      return {
        ok: false,
        reason: 'The key must start with "sk-or-" and be between 20 and 200 characters.',
      };
    }

    let res: Response;
    try {
      res = await fetch(OPENROUTER_AUTH_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
      });
    } catch {
      return { ok: false, reason: "Could not reach OpenRouter to verify the key. Try again." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "OpenRouter rejected this key." };
    }
    if (!res.ok) {
      return { ok: false, reason: "OpenRouter could not verify the key right now. Try again." };
    }
    return { ok: true, key: trimmed };
  }
}
