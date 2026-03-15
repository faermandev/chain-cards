'use client';

import CardDisplay from './CardDisplay';
import { useCardRegistryAddress } from '@/lib/contracts/duelGame';
import { CARDREGISTRY_ABI } from '@/lib/contracts/cardRegistry';
import { useReadContracts } from 'wagmi';
import type { Address } from 'viem';

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
  cards = [...DEFAULT_CARDS],
  selected,
  onChange,
  activeRound,
  onRoundSelect,
}: CardSelectorProps) {
  const registryRead = useCardRegistryAddress();
  const cardRegistry = registryRead.data as Address | undefined;

  const existsReads = useReadContracts({
    allowFailure: true,
    contracts: cardRegistry
      ? cards.map((cardId) => ({
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
      ? cards.map((cardId) => ({
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
      (s, i) => s === cardId && i !== activeRound
    );
    if (alreadyInOtherRound) return; // card already used in another round

    // toggle off if same card clicked
    if (selected[activeRound] === cardId) {
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
          const cardId = selected[i];
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
          {cards.map((cardId, idx) => {
            const isSelectedHere = selected[activeRound] === cardId;
            const isUsedElsewhere = selected.some((s, i) => s === cardId && i !== activeRound);
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
      </div>
    </div>
  );
}
