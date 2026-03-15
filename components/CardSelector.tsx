'use client';

import CardDisplay from './CardDisplay';
import { useCardRegistryAddress } from '@/lib/contracts/duelGame';
import { CARDREGISTRY_ABI } from '@/lib/contracts/cardRegistry';
import { useEffect, useMemo, useState } from 'react';
import { useChainId, usePublicClient, useReadContracts } from 'wagmi';
import type { AbiEvent, Address } from 'viem';
import { getCardRegistryFromBlock } from '@/lib/contracts/fromBlocks';

type TupleLike = Record<string, unknown> & { [index: number]: unknown };

function normalizeStats(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as TupleLike;
  return {
    combat: BigInt((t.combat ?? t[0] ?? 0) as bigint | number | string),
    defense: BigInt((t.defense ?? t[1] ?? 0) as bigint | number | string),
    speed: BigInt((t.speed ?? t[2] ?? 0) as bigint | number | string),
    element: BigInt((t.element ?? t[3] ?? 0) as bigint | number | string),
    exists: Boolean(t.exists ?? t[4] ?? false),
  };
}

interface CardSelectorProps {
  rounds: number;
  cards?: bigint[];
  selected: (bigint | null)[];
  onChange: (round: number, cardId: bigint | null) => void;
  activeRound: number;
  onRoundSelect: (round: number) => void;
}

const DEFAULT_CARDS = [1n, 2n, 3n, 4n, 5n] as const;

export default function CardSelector({
  rounds,
  cards,
  selected,
  onChange,
  activeRound,
  onRoundSelect,
}: CardSelectorProps) {
  const registryRead = useCardRegistryAddress();
  const cardRegistry = registryRead.data as Address | undefined;
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [discoveredCards, setDiscoveredCards] = useState<bigint[] | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const effectiveCards = useMemo(() => {
    if (cards && cards.length > 0) return cards;
    if (discoveredCards && discoveredCards.length > 0) return discoveredCards;
    return [...DEFAULT_CARDS];
  }, [cards, discoveredCards]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cardRegistry || !publicClient) return;
      setDiscoveryError(null);

      try {
        const abiItems = CARDREGISTRY_ABI as unknown as readonly { type?: string; name?: string }[];
        const event = abiItems.find(
          (x): x is AbiEvent => x.type === 'event' && x.name === 'CardTypeCreated',
        );

        if (!event) throw new Error('CardTypeCreated event not found in ABI.');

        const latest = await publicClient.getBlockNumber();
        const explicitFrom = getCardRegistryFromBlock(chainId);
        if (explicitFrom === undefined && chainId !== 31337) {
          throw new Error(
            `RPC limits eth_getLogs to small block ranges on this network. Set NEXT_PUBLIC_CARDREGISTRY_FROM_BLOCK_${chainId} to the CardRegistry deployment block to enable full discovery.`,
          );
        }

        const fromBlock = explicitFrom ?? 0n;
        const chunkSize = chainId === 31337 ? 50_000n : 100n; // Monad RPC: 100-block getLogs window

        const logs: unknown[] = [];
        for (let start = fromBlock; start <= latest; start += chunkSize) {
          if (cancelled) return;
          const end = start + chunkSize - 1n;
          const toBlock = end > latest ? latest : end;
          const chunk = await publicClient.getLogs({
            address: cardRegistry,
            event,
            fromBlock: start,
            toBlock,
          });
          logs.push(...chunk);

          // Tiny delay to avoid hammering rate limits
          if (chainId !== 31337) {
            await new Promise((r) => setTimeout(r, 15));
          }
        }

        const ids = Array.from(
          new Set(
            logs
              .map((l) => (l as { args?: { cardId?: bigint } }).args?.cardId)
              .filter((v): v is bigint => typeof v === 'bigint'),
          ),
        ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        if (!cancelled) setDiscoveredCards(ids.length > 0 ? ids : null);
      } catch (err) {
        if (cancelled) return;
        setDiscoveredCards(null);
        setDiscoveryError((err as Error).message);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [cardRegistry, chainId, publicClient]);

  const existsReads = useReadContracts({
    allowFailure: true,
    contracts: cardRegistry
      ? effectiveCards.map((cardId) => ({
          address: cardRegistry,
          abi: CARDREGISTRY_ABI,
          functionName: 'cardExists' as const,
          args: [cardId] as const,
        }))
      : [],
    query: { enabled: Boolean(cardRegistry) },
  });

  const statsReads = useReadContracts({
    allowFailure: true,
    contracts: cardRegistry
      ? effectiveCards.map((cardId) => ({
          address: cardRegistry,
          abi: CARDREGISTRY_ABI,
          functionName: 'getCardStats' as const,
          args: [cardId] as const,
        }))
      : [],
    query: { enabled: Boolean(cardRegistry) },
  });

  const roundLabels = Array.from({ length: rounds }, (_, i) => `Round ${i + 1}`);

  function pickCard(cardId: bigint) {
    const alreadyInOtherRound = selected.some(
      (s, i) => (s ?? null) === cardId && i !== activeRound
    );
    if (alreadyInOtherRound) return; // card already used in another round

    // toggle off if same card clicked
    if ((selected[activeRound] ?? null) === cardId) {
      onChange(activeRound, null);
    } else {
      onChange(activeRound, cardId);
    }
  }

  return (
    <div className="space-y-6">
      {/* Round tabs */}
      <div className="flex gap-2">
        {roundLabels.map((label, i) => {
          const cardId = selected[i] ?? null;
          return (
            <button
              key={i}
              onClick={() => onRoundSelect(i)}
              className={[
                'flex-1 rounded-lg border-2 p-3 text-left transition-all duration-150',
                activeRound === i
                  ? 'border-white bg-gray-700'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-400',
              ].join(' ')}
            >
              <div className="text-xs text-gray-400 font-medium">{label}</div>
              <div className="text-sm font-bold text-white mt-0.5 truncate">
                {cardId !== null ? `Card #${cardId.toString()}` : <span className="text-gray-500 italic">No card</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div>
        <p className="text-sm text-gray-400 mb-3">
          Picking for{' '}
          <span className="text-white font-medium">{roundLabels[activeRound]}</span>
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {effectiveCards.map((cardId, idx) => {
            const isSelectedHere = (selected[activeRound] ?? null) === cardId;
            const isUsedElsewhere = selected.some((s, i) => (s ?? null) === cardId && i !== activeRound);
            const exists = existsReads.data?.[idx]?.result as boolean | undefined;
            const stats = normalizeStats(statsReads.data?.[idx]?.result as unknown);
            return (
              <CardDisplay
                key={cardId.toString()}
                cardId={cardId}
                exists={exists}
                stats={stats}
                selected={isSelectedHere}
                disabled={isUsedElsewhere || exists === false}
                onClick={() => pickCard(cardId)}
              />
            );
          })}
        </div>
        {discoveryError && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
            Could not discover all cards from events. Showing fallback list. Details: {discoveryError}
          </div>
        )}
        {!cards && !discoveredCards && !discoveryError && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
            Discovering card types from CardRegistry events…
          </div>
        )}
      </div>
    </div>
  );
}
