'use client';

import type { Address } from 'viem';
import { bytesToHex } from 'viem';

export type DuelSecret = {
  matchId: string;
  player: Address;
  lineup: string[];
  salt32: `0x${string}`;
  createdAt: number;
};

function secretKey(params: { chainId: number; matchId: bigint; player: Address }) {
  return `duel:v1:${params.chainId}:${params.matchId.toString()}:${params.player.toLowerCase()}`;
}

export function generateSalt32(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes) as `0x${string}`;
}

export function saveSecret(params: {
  chainId: number;
  matchId: bigint;
  player: Address;
  lineup: bigint[];
  salt32: `0x${string}`;
}) {
  const payload: DuelSecret = {
    matchId: params.matchId.toString(),
    player: params.player,
    lineup: params.lineup.map((x) => x.toString()),
    salt32: params.salt32,
    createdAt: Date.now(),
  };
  localStorage.setItem(secretKey(params), JSON.stringify(payload));
}

export function loadSecret(params: { chainId: number; matchId: bigint; player: Address }) {
  const raw = localStorage.getItem(secretKey(params));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DuelSecret;
  } catch {
    return null;
  }
}

export function deleteSecret(params: { chainId: number; matchId: bigint; player: Address }) {
  localStorage.removeItem(secretKey(params));
}

export function moveSecret(params: {
  chainId: number;
  fromMatchId: bigint;
  toMatchId: bigint;
  player: Address;
}) {
  const existing = loadSecret({ chainId: params.chainId, matchId: params.fromMatchId, player: params.player });
  if (!existing) return;
  localStorage.setItem(
    secretKey({ chainId: params.chainId, matchId: params.toMatchId, player: params.player }),
    JSON.stringify({ ...existing, matchId: params.toMatchId.toString() }),
  );
  deleteSecret({ chainId: params.chainId, matchId: params.fromMatchId, player: params.player });
}

export function exportSecretJson(params: { chainId: number; matchId: bigint; player: Address }) {
  const secret = loadSecret(params);
  if (!secret) throw new Error('Secret not found on this device.');
  return JSON.stringify(secret, null, 2);
}

export function importSecretJson(params: { chainId: number; json: string }) {
  const parsed = JSON.parse(params.json) as DuelSecret;
  if (!parsed?.matchId || !parsed?.player || !parsed?.lineup || !parsed?.salt32) {
    throw new Error('Invalid secret JSON.');
  }
  const matchId = BigInt(parsed.matchId);
  const player = (parsed.player as string).toLowerCase() as Address;
  localStorage.setItem(
    secretKey({ chainId: params.chainId, matchId, player }),
    JSON.stringify({ ...parsed, player }),
  );
  return { matchId, player };
}

