'use client';

import { importAesKey } from './encryption';

/**
 * The fixed message the user signs to derive their encryption key.
 * Changing this message invalidates all existing encrypted secrets.
 */
export const KEY_DERIVATION_MESSAGE = 'Duel Cards Secret Storage v1';

/**
 * Derive a 256-bit AES-GCM key from a wallet signature.
 *
 * Flow:
 *   1. User signs KEY_DERIVATION_MESSAGE with their wallet
 *   2. The hex signature is hashed with SHA-256 via Web Crypto
 *   3. The 32-byte digest is used as a raw AES-256 key
 *
 * The backend never sees this key — it only stores the encrypted output.
 */
export async function deriveKeyFromSignature(signature: string): Promise<CryptoKey> {
  // Remove '0x' prefix if present
  const hex = signature.startsWith('0x') ? signature.slice(2) : signature;

  // Convert hex to bytes
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // SHA-256 the signature bytes → 32-byte key material
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return importAesKey(digest);
}
