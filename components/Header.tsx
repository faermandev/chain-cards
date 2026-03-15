'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import ConnectWallet from './ConnectWallet';
import { useStakeToken } from '@/lib/contracts/duelGame';
import { useErc20Balance, useErc20Decimals, useErc20Symbol } from '@/lib/contracts/erc20';
import { formatUnits, type Address } from 'viem';

function formatTokenAmount(amount: bigint, decimals: number, maxFractionDigits: number) {
  const full = formatUnits(amount, decimals);
  const [intPart, fracPart = ''] = full.split('.');
  if (maxFractionDigits <= 0) return intPart;
  const trimmedFrac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
}

export default function Header() {
  const { address } = useAccount();
  const stakeTokenRead = useStakeToken();
  const stakeToken = stakeTokenRead.data as Address | undefined;
  const symbolRead = useErc20Symbol(stakeToken);
  const decimalsRead = useErc20Decimals(stakeToken);
  const balanceRead = useErc20Balance(stakeToken, address as Address | undefined);

  const symbol = (symbolRead.data as string | undefined) ?? 'TOKEN';
  const decimals = (decimalsRead.data as number | undefined) ?? 18;
  const balance =
    balanceRead.data !== undefined
      ? formatTokenAmount(balanceRead.data as bigint, decimals, 6)
      : null;

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-white">
          <span className="text-2xl">⚔️</span>
          <span>Chain Cards</span>
        </Link>

        <div className="flex items-center gap-3">
          {address && balance !== null && (
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5">
              <span className="text-xs text-gray-400">Balance</span>
              <span className="text-sm font-bold text-green-400">
                {balance} {symbol}
              </span>
            </div>
          )}
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
