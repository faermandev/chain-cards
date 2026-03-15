'use client';

import type { CardStats } from '@/lib/contracts/cardRegistry';
import Image from 'next/image';

const ELEMENT_CONFIG: Record<
  number,
  { label: string; bg: string; border: string; badge: string; symbol: string }
> = {
  0: {
    label: 'Fire',
    bg: 'from-red-950 to-orange-950',
    border: 'border-red-600',
    badge: 'bg-red-600 text-white',
    symbol: '🔥',
  },
  1: {
    label: 'Water',
    bg: 'from-blue-950 to-cyan-950',
    border: 'border-blue-500',
    badge: 'bg-blue-600 text-white',
    symbol: '💧',
  },
  2: {
    label: 'Grass',
    bg: 'from-green-950 to-emerald-950',
    border: 'border-green-500',
    badge: 'bg-green-600 text-white',
    symbol: '🌿',
  },
  3: {
    label: 'Rock',
    bg: 'from-stone-900 to-amber-950',
    border: 'border-amber-700',
    badge: 'bg-amber-700 text-white',
    symbol: '🪨',
  },
  4: {
    label: 'Electric',
    bg: 'from-yellow-950 to-amber-950',
    border: 'border-yellow-400',
    badge: 'bg-yellow-500 text-black',
    symbol: '⚡',
  },
  5: {
    label: 'Ice',
    bg: 'from-cyan-950 to-sky-950',
    border: 'border-cyan-400',
    badge: 'bg-cyan-500 text-black',
    symbol: '❄️',
  },
};

function elementFromCardId(cardId: bigint): number | null {
  const n = Number(cardId);
  if (!Number.isSafeInteger(n)) return null;
  if (n >= 1 && n <= 3) return 0; // fire
  if (n >= 4 && n <= 6) return 1; // water
  if (n >= 7 && n <= 9) return 2; // grass
  if (n >= 10 && n <= 12) return 3; // rock
  if (n >= 13 && n <= 15) return 4; // electric
  if (n >= 16 && n <= 18) return 5; // ice
  return null;
}

function imageForCardId(cardId: bigint): string | null {
  const n = Number(cardId);
  if (!Number.isSafeInteger(n)) return null;

  if (n >= 1 && n <= 3) return `/images/fire${((n - 1) % 3) + 1}.png`;
  if (n >= 4 && n <= 6) return `/images/water${((n - 4) % 3) + 1}.png`;
  if (n >= 7 && n <= 9) return `/images/grass${((n - 7) % 3) + 1}.png`;
  if (n >= 10 && n <= 12) return `/images/rock${((n - 10) % 3) + 1}.png`;
  if (n >= 13 && n <= 15) return `/images/eletric${((n - 13) % 3) + 1}.png`;
  if (n >= 16 && n <= 18) return `/images/ice${((n - 16) % 3) + 1}.png`;
  return null;
}

interface CardDisplayProps {
  cardId: bigint;
  exists?: boolean;
  stats?: CardStats | null;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  roundLabel?: string;
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-gray-300">{label}</span>
      <span className="font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

export default function CardDisplay({
  cardId,
  exists,
  stats,
  selected,
  onClick,
  disabled,
  roundLabel,
}: CardDisplayProps) {
  const elementOverride = elementFromCardId(cardId);
  const element = stats ? Number(stats.element) : elementOverride;
  const imageSrc = imageForCardId(cardId);
  const cfg =
    element !== null && ELEMENT_CONFIG[element]
      ? ELEMENT_CONFIG[element]
      : {
          label: element === null ? 'Unknown' : `Element ${element}`,
          bg: 'from-gray-900 to-gray-950',
          border: 'border-gray-700',
          badge: 'bg-gray-700 text-white',
          symbol: '🃏',
        };

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={[
        'relative rounded-xl border-2 bg-gradient-to-br p-4 transition-all duration-200 select-none',
        cfg.bg,
        cfg.border,
        onClick && !disabled ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : '',
        selected ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105' : '',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {roundLabel && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-800 border border-gray-600 px-2 py-0.5 text-xs font-bold text-gray-200 whitespace-nowrap">
          {roundLabel}
        </div>
      )}

      {selected && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">
          ✓
        </div>
      )}

      {imageSrc && (
        <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/10 bg-black/20">
          <Image
            src={imageSrc}
            alt={`${cfg.label} card ${cardId.toString()}`}
            fill
            sizes="(max-width: 640px) 120px, 160px"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{cfg.symbol}</span>
        <div>
          <div className="font-bold text-white text-sm leading-tight">{`Card #${cardId.toString()}`}</div>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {exists === false && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          Not registered
        </div>
      )}

      {exists !== false && stats && (
        <div className="space-y-1.5">
          <StatRow label="COM" value={stats.combat.toString()} />
          <StatRow label="DEF" value={stats.defense.toString()} />
          <StatRow label="SPD" value={stats.speed.toString()} />
        </div>
      )}

      {exists !== false && !stats && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-400">
          Loading stats…
        </div>
      )}
    </div>
  );
}
