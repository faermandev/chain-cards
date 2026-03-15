'use client';

/**
 * Client-side helpers for wallet-based authentication.
 *
 * Flow:
 *  1. GET  /api/auth/nonce  → { nonce }
 *  2. sign nonce with wallet
 *  3. POST /api/auth/verify { address, signature } → sets HTTP-only cookie
 *  4. All subsequent fetch() calls send cookie automatically (same-origin)
 */

// ── Nonce ─────────────────────────────────────────────────────────────────────

/** Fetch a challenge nonce from the backend for the given address. */
export async function fetchNonce(address: string): Promise<string> {
  const res = await fetch(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error('Failed to fetch nonce');
  const data = await res.json();
  return data.nonce as string;
}

// ── Verify ────────────────────────────────────────────────────────────────────

/** Send a signed nonce to the backend to obtain an auth session cookie. */
export async function verifySignature(address: string, signature: string): Promise<void> {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Auth verification failed');
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
