/**
 * Minimal HS256 JWT implementation using the Web Crypto API.
 * Avoids external dependencies while staying Workers-compatible.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface JwtPayload {
  sub: number; // user id
  iat: number; // issued at (unix seconds)
  exp: number; // expiration (unix seconds)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign a JWT for the given user id.
 *
 * @param secret - The signing secret (env.JWT_SECRET).
 * @param userId - The authenticated user's id.
 * @returns Signed compact JWT string.
 */
export async function signJwt(secret: string, userId: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub: userId, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const header = { alg: "HS256", typ: "JWT" };

  const headerPart = base64UrlEncode(encodeJson(header));
  const payloadPart = base64UrlEncode(encodeJson(payload));
  const signingInput = `${headerPart}.${payloadPart}`;

  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a JWT's signature and expiration.
 *
 * @param secret - The signing secret (env.JWT_SECRET).
 * @param token - Compact JWT string.
 * @returns The payload when valid, otherwise `null`.
 */
export async function verifyJwt(secret: string, token: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: { alg?: string };
  try {
    header = decodeJson(base64UrlDecode(headerPart));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    base64UrlDecode(signaturePart) as BufferSource,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) {
    return null;
  }

  let payload: JwtPayload;
  try {
    payload = decodeJson(base64UrlDecode(payloadPart));
  } catch {
    return null;
  }
  if (typeof payload.sub !== "number" || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}