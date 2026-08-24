/**
 * Password hashing using PBKDF2-SHA256 via the Web Crypto API.
 *
 * bcrypt/scrypt native modules are not available on Cloudflare Workers,
 * so PBKDF2 is used with a high iteration count and per-user random salt.
 *
 * Stored format: `pbkdf2:<iterations>:<salt_b64>:<hash_b64>`
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes
const HASH_ALGO = "SHA-256";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: HASH_ALGO },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Hash a plaintext password for storage.
 *
 * @param password - Plaintext password.
 * @returns Encoded hash string `pbkdf2:<iterations>:<salt_b64>:<hash_b64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toBase64(salt)}:${toBase64(hash)}`;
}

/**
 * Verify a plaintext password against a stored hash.
 *
 * @param password - Plaintext password to check.
 * @param stored - Encoded hash string produced by {@link hashPassword}.
 * @returns `true` when the password matches.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }
  const salt = fromBase64(parts[2]!);
  const expected = fromBase64(parts[3]!);
  const actual = await deriveBits(password, salt, iterations);
  if (actual.length !== expected.length) {
    return false;
  }
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i]! ^ expected[i]!;
  }
  return diff === 0;
}