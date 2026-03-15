'use client';

import type { Address } from 'viem';

export type MatchHistoryItem = {
  matchId: string;
  role: 'creator' | 'opponent';
  createdAt: number;
};

function historyKey(chainId: number, player: Address) {
  return `duel:v1:history:${chainId}:${player.toLowerCase()}`;
}

export function listRecentMatches(chainId: number, player: Address): MatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(chainId, player));
    const parsed = raw ? (JSON.parse(raw) as MatchHistoryItem[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.matchId === 'string')
      .slice(0, 50);
  } catch {
    return [];
  }
}

export function addRecentMatch(chainId: number, player: Address, item: Omit<MatchHistoryItem, 'createdAt'>) {
  const current = listRecentMatches(chainId, player);
  const next: MatchHistoryItem[] = [
    { ...item, createdAt: Date.now() },
    ...current.filter((x) => x.matchId !== item.matchId),
  ].slice(0, 50);
  localStorage.setItem(historyKey(chainId, player), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('duel:v1:history-update'));
}
