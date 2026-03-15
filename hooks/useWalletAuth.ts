'use client';

import { useState, useCallback, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { fetchNonce, verifySignature, logout as apiLogout } from '@/lib/wallet/auth';
import { KEY_DERIVATION_MESSAGE } from '@/lib/crypto/keyDerivation';
import { deriveKeyFromSignature } from '@/lib/crypto/keyDerivation';

export type AuthStatus = 'idle' | 'signing' | 'verifying' | 'authenticated' | 'error';

export interface WalletAuthState {
  status: AuthStatus;
  error: string | null;
  /** AES-GCM CryptoKey derived from the user's encryption signature. null until authenticated. */
  encryptionKey: CryptoKey | null;
  authenticate: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Manages two separate wallet signatures:
 *  1. Auth signature  — signs a timestamp-based nonce to get a session cookie
 *  2. Encryption signature — signs KEY_DERIVATION_MESSAGE to derive the AES key
 *
 * The AES key lives only in memory. On page refresh the user must re-authenticate.
 * Re-auth is fast (one click in most wallets) and preserves the encrypted backup in Supabase.
 */
export function useWalletAuth(): WalletAuthState {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

  // Prevent double-signing if called multiple times
  const inProgress = useRef(false);

  const authenticate = useCallback(async () => {
    if (!isConnected || !address) {
      setError('Wallet not connected');
      return;
    }
    if (inProgress.current) return;
    inProgress.current = true;
    setError(null);

    try {
      setStatus('signing');

      // ── Signature 1: auth nonce ────────────────────────────────────────────
      const nonce = await fetchNonce(address);
      const authSig = await signMessageAsync({ message: nonce });

      setStatus('verifying');
      await verifySignature(address, authSig);

      // ── Signature 2: encryption key derivation ───────────────────────────
      // This is a deterministic, read-only sign — it never goes on-chain.
      const encSig = await signMessageAsync({ message: KEY_DERIVATION_MESSAGE });
      const key = await deriveKeyFromSignature(encSig);

      setEncryptionKey(key);
      setStatus('authenticated');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      setStatus('error');
    } finally {
      inProgress.current = false;
    }
  }, [address, isConnected, signMessageAsync]);

  const logout = useCallback(async () => {
    await apiLogout();
    setEncryptionKey(null);
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, encryptionKey, authenticate, logout };
}
