import CardRegistryArtifact from '@/lib/abi/CardRegistry.json';
import { useReadContract } from 'wagmi';
import type { Abi, Address } from 'viem';

export const CARDREGISTRY_ABI = CardRegistryArtifact.abi as Abi;

export type CardStats = {
  combat: bigint;
  defense: bigint;
  speed: bigint;
  element: bigint;
  exists: boolean;
};

type TupleLike = Record<string, unknown> & { [index: number]: unknown };

function toBigInt(value: unknown, fallback: bigint) {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value) return BigInt(value);
  } catch {
    // ignore
  }
  return fallback;
}

function normalizeCardStats(raw: unknown): CardStats {
  const t = (raw ?? {}) as TupleLike;
  const combat = toBigInt(t.combat ?? t[0], 0n);
  const defense = toBigInt(t.defense ?? t[1], 0n);
  const speed = toBigInt(t.speed ?? t[2], 0n);
  const element = toBigInt(t.element ?? t[3], 0n);
  const exists = Boolean(t.exists ?? t[4] ?? false);
  return { combat, defense, speed, element, exists };
}

export function useCardExists(cardRegistry: Address | undefined, cardId: bigint | undefined) {
  return useReadContract({
    address: cardRegistry,
    abi: CARDREGISTRY_ABI,
    functionName: 'cardExists',
    args: cardRegistry && cardId !== undefined ? [cardId] : undefined,
    query: { enabled: Boolean(cardRegistry) && cardId !== undefined },
  });
}

export function useGetCardStats(cardRegistry: Address | undefined, cardId: bigint | undefined) {
  const read = useReadContract({
    address: cardRegistry,
    abi: CARDREGISTRY_ABI,
    functionName: 'getCardStats',
    args: cardRegistry && cardId !== undefined ? [cardId] : undefined,
    query: { enabled: Boolean(cardRegistry) && cardId !== undefined },
  });

  return { ...read, stats: read.data ? normalizeCardStats(read.data) : null };
}
