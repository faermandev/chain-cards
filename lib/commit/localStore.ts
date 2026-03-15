import type { MatchSecret } from './types';

const KEY_PREFIX = 'cc-secret-';
const PENDING_INDEX_KEY = 'cc-secret-index';

// ── Index helpers ─────────────────────────────────────────────────────────────
// We keep a list of local IDs so we can enumerate all local secrets.

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  localStorage.setItem(PENDING_INDEX_KEY, JSON.stringify(ids));
}

function addToIndex(localId: string): void {
  const ids = readIndex();
  if (!ids.includes(localId)) {
    ids.push(localId);
    writeIndex(ids);
  }
}

function removeFromIndex(localId: string): void {
  writeIndex(readIndex().filter((id) => id !== localId));
}

// ── Local ID ──────────────────────────────────────────────────────────────────
// Before a Supabase id is known, we use a local key based on commitHash.

function localKey(commitHash: string): string {
  return KEY_PREFIX + commitHash.slice(2, 18); // short prefix of commitHash
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Persist a match secret locally. Uses commitHash as stable key. */
export function saveLocalSecret(secret: MatchSecret): void {
  const key = localKey(secret.commitHash);
  localStorage.setItem(key, JSON.stringify({ ...secret, updatedAt: new Date().toISOString() }));
  addToIndex(key);
}

/** Read a single secret by commitHash. */
export function getLocalSecret(commitHash: string): MatchSecret | null {
  try {
    const raw = localStorage.getItem(localKey(commitHash));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Read all local secrets for a given player address. */
export function getAllLocalSecrets(playerAddress: string): MatchSecret[] {
  const ids = readIndex();
  const results: MatchSecret[] = [];
  for (const key of ids) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s: MatchSecret = JSON.parse(raw);
      if (s.playerAddress.toLowerCase() === playerAddress.toLowerCase()) {
        results.push(s);
      }
    } catch {
      // skip corrupt entries
    }
  }
  return results;
}

/** Update fields on an existing secret (matched by commitHash). */
export function updateLocalSecret(
  commitHash: string,
  patch: Partial<MatchSecret>
): void {
  const existing = getLocalSecret(commitHash);
  if (!existing) return;
  saveLocalSecret({ ...existing, ...patch, commitHash });
}

/** Delete a local secret by commitHash. */
export function deleteLocalSecret(commitHash: string): void {
  const key = localKey(commitHash);
  localStorage.removeItem(key);
  removeFromIndex(key);
}

/** Return secrets with status 'submitted' or 'draft' (need reconciliation). */
export function getPendingLocalSecrets(playerAddress: string): MatchSecret[] {
  return getAllLocalSecrets(playerAddress).filter(
    (s) => s.status === 'draft' || s.status === 'submitted'
  );
}
