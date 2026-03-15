'use client';

// ── AES-GCM helpers using the Web Crypto API ──────────────────────────────────
// All functions are async and work in the browser.

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // bytes

// ── Encoding helpers ──────────────────────────────────────────────────────────

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Key import/export ─────────────────────────────────────────────────────────

/**
 * Import a 32-byte raw key buffer as a CryptoKey for AES-GCM.
 */
export async function importAesKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKey, { name: ALGORITHM }, false, ['encrypt', 'decrypt']);
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  encryptedSalt: string; // base64 ciphertext
  iv: string;            // base64 IV
}

/**
 * Encrypt a hex salt string (e.g. bytes32 0x...) with the given CryptoKey.
 * Returns base64-encoded ciphertext and IV.
 */
export async function encryptSalt(salt: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(salt);

  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);

  return {
    encryptedSalt: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypt a base64 ciphertext back into the hex salt string.
 */
export async function decryptSalt(
  encryptedSalt: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64ToBuffer(encryptedSalt);
  const ivBuffer = base64ToBuffer(iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(ivBuffer) },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}
