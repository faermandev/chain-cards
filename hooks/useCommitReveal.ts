'use client';

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { generateSalt, computeCommitHash } from '@/lib/crypto/salt';
import { encryptSalt, decryptSalt } from '@/lib/crypto/encryption';
import {
  saveLocalSecret,
  getLocalSecret,
  updateLocalSecret,
  getPendingLocalSecrets,
} from '@/lib/commit/localStore';
import type { MatchSecret, MatchSecretStatus } from '@/lib/commit/types';

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiCreate(payload: Omit<MatchSecret, 'id' | 'matchId' | 'txHash' | 'createdAt' | 'updatedAt'>) {
  const res = await fetch('/api/secrets/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to create secret');
  }
  return (await res.json()) as { id: string };
}

async function apiUpdate(id: string, patch: { matchId?: number; txHash?: string; status?: MatchSecretStatus }) {
  const res = await fetch('/api/secrets/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) throw new Error('Failed to update secret');
}

async function apiFetchByMatchId(matchId: number): Promise<MatchSecret | null> {
  const res = await fetch(`/api/secrets/${matchId}`);
  if (!res.ok) return null;
  return res.json();
}

async function apiFetchPending(): Promise<MatchSecret[]> {
  const res = await fetch('/api/secrets/pending');
  if (!res.ok) return [];
  return res.json();
}

async function apiFetchByTx(txHash: string): Promise<MatchSecret | null> {
  const res = await fetch('/api/secrets/by-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CommitRevealState {
  /** True while any async operation is in progress */
  loading: boolean;
  error: string | null;
  /**
   * Flow 1 — Prepare a commit secret before the on-chain tx.
   * Returns: { salt, commitHash, encryptedSalt, iv } ready for on-chain use.
   */
  prepareCommit: (lineup: number[], encryptionKey: CryptoKey) => Promise<{
    salt: `0x${string}`;
    commitHash: `0x${string}`;
    encryptedSalt: string;
    iv: string;
  }>;
  /**
   * Flow 2 — Reconcile after on-chain tx is confirmed.
   * Updates local store + backend with txHash, matchId, and status.
   */
  reconcileAfterTx: (
    commitHash: string,
    txHash: string,
    matchId: number
  ) => Promise<void>;
  /**
   * Flow 3 — Recover the plaintext salt needed for reveal.
   * Tries localStorage first, then fetches from backend and decrypts.
   */
  recoverSalt: (
    commitHash: string,
    encryptionKey: CryptoKey,
    matchId?: number
  ) => Promise<`0x${string}` | null>;
  /** Return all local pending secrets for the current wallet. */
  getPending: () => MatchSecret[];
  /** Sync pending secrets from backend (recovery after data loss). */
  syncFromBackend: (encryptionKey: CryptoKey) => Promise<MatchSecret[]>;
}

export function useCommitReveal(): CommitRevealState {
  const { address } = useAccount();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Flow 1: prepare ────────────────────────────────────────────────────────
  const prepareCommit = useCallback(
    async (lineup: number[], encryptionKey: CryptoKey) =>
      run(async () => {
        if (!address) throw new Error('Wallet not connected');

        const salt = generateSalt();
        const commitHash = computeCommitHash(lineup, salt);
        const { encryptedSalt, iv } = await encryptSalt(salt, encryptionKey);

        const secret: MatchSecret = {
          chainId,
          playerAddress: address,
          commitHash,
          lineup,
          encryptedSalt,
          iv,
          status: 'draft',
        };

        // 1. Save locally (survives refresh before tx is sent)
        saveLocalSecret(secret);

        // 2. Persist to backend (survives localStorage clear)
        try {
          const { id } = await apiCreate({
            chainId,
            playerAddress: address,
            commitHash,
            lineup,
            encryptedSalt,
            iv,
            status: 'draft',
          });
          updateLocalSecret(commitHash, { id, status: 'submitted' });
        } catch {
          // Backend failure is non-fatal — local copy is enough to proceed
          console.warn('Backend sync failed; proceeding with local-only secret');
        }

        return { salt, commitHash, encryptedSalt, iv };
      }),
    [address, chainId, run]
  );

  // ── Flow 2: reconcile after tx ────────────────────────────────────────────
  const reconcileAfterTx = useCallback(
    async (commitHash: string, txHash: string, matchId: number) =>
      run(async () => {
        // Update local store
        updateLocalSecret(commitHash, { txHash, matchId, status: 'confirmed' });

        // Update backend
        const local = getLocalSecret(commitHash);
        if (local?.id) {
          await apiUpdate(local.id, { txHash, matchId, status: 'confirmed' });
        }
      }),
    [run]
  );

  // ── Flow 3: recover salt ──────────────────────────────────────────────────
  const recoverSalt = useCallback(
    async (commitHash: string, encryptionKey: CryptoKey, matchId?: number) =>
      run(async () => {
        // Try local first
        const local = getLocalSecret(commitHash);
        if (local) {
          const salt = await decryptSalt(local.encryptedSalt, local.iv, encryptionKey);
          return salt as `0x${string}`;
        }

        // Fallback: fetch from backend
        let remote: MatchSecret | null = null;

        if (matchId !== undefined) {
          remote = await apiFetchByMatchId(matchId);
        }

        if (!remote) return null;

        // Restore to local store for future use
        saveLocalSecret(remote);

        const salt = await decryptSalt(remote.encryptedSalt, remote.iv, encryptionKey);
        return salt as `0x${string}`;
      }),
    [run]
  );

  // ── Pending secrets ────────────────────────────────────────────────────────
  const getPending = useCallback((): MatchSecret[] => {
    if (!address) return [];
    return getPendingLocalSecrets(address);
  }, [address]);

  // ── Sync from backend ─────────────────────────────────────────────────────
  const syncFromBackend = useCallback(
    async (encryptionKey: CryptoKey) =>
      run(async () => {
        const remotes = await apiFetchPending();
        for (const secret of remotes) {
          const existing = getLocalSecret(secret.commitHash);
          if (!existing) {
            // Verify we can decrypt before saving (validates the key is correct)
            try {
              await decryptSalt(secret.encryptedSalt, secret.iv, encryptionKey);
              saveLocalSecret(secret);
            } catch {
              console.warn('Could not decrypt remote secret — key mismatch?', secret.commitHash);
            }
          }
        }
        return remotes;
      }),
    [run]
  );

  return {
    loading,
    error,
    prepareCommit,
    reconcileAfterTx,
    recoverSalt,
    getPending,
    syncFromBackend,
  };
}
