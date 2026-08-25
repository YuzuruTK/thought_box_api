/**
 * EncryptionService — envelope encryption for BYOK API keys.
 *
 * The master key (KEK) is a 32-byte base64 string stored as a Worker secret
 * (`BYOK_KEK_V1`). Keys are encrypted with AES-256-GCM using a fresh random IV
 * per write; the KEK version tag enables future key rotation.
 *
 * Plaintext secrets exist ONLY within this module's callers and are never
 * logged, stored, or serialized.
 */

export const KEK_VERSION = 1;

/** Format a master key value like `BYOK_KEK_V1`. */
export function kekSecretVar(version = KEK_VERSION): string {
  return `BYOK_KEK_V${version}`;
}

export class EncryptionError extends Error {
  constructor(message = "Encryption error.") {
    super(message);
    this.name = "EncryptionError";
  }
}

export class EncryptionService {
  private readonly cryptoKey: Promise<CryptoKey>;

  /**
   * @param kekBase64 exactly 32 bytes encoded as base64 (from a Worker secret).
   * @param version Master-key version this instance encrypts with.
   */
  constructor(
    kekBase64: string,
    private readonly version: number = KEK_VERSION,
  ) {
    let raw: Uint8Array;
    try {
      const binary = atob(kekBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.byteLength !== 32) {
        throw new EncryptionError(`Invalid KEK length (${bytes.byteLength} bytes); expected 32.`);
      }
      raw = bytes;
    } catch (error) {
      if (error instanceof EncryptionError) throw error;
      throw new EncryptionError("Invalid KEK secret format.");
    }
    this.cryptoKey = crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /** Encrypt a plaintext secret. Returns base64 ciphertext + IV (base64). */
  async encrypt(plaintext: string): Promise<{ ciphertext: string; iv: string; version: number }> {
    const data = new TextEncoder().encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.cryptoKey;
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return {
      ciphertext: toBase64(new Uint8Array(encrypted)),
      iv: toBase64(iv),
      version: this.version,
    };
  }

  /** Decrypt a base64 ciphertext + IV. */
  async decrypt(ciphertext: string, iv: string): Promise<string> {
    try {
      const key = await this.cryptoKey;
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) },
        key,
        fromBase64(ciphertext),
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      throw new EncryptionError("Failed to decrypt secret.");
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
