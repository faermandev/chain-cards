'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import ConnectWallet from '@/components/ConnectWallet';
import { useGameUser } from '@/hooks/useGameUser';
import { listRecentMatches } from '@/lib/duel/history';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { getDuelGameAddress } from '@/lib/contracts/addresses';
import DuelGameArtifact from '@/lib/abi/DuelGame.json';
import { useGetMatchInfo, useNextMatchId } from '@/lib/contracts/duelGame';
import type { Abi, Address } from 'viem';

export default function Home() {
  const { user, address, isConnected, isConnecting } = useGameUser();
  const chainId = useChainId();
  const [openId, setOpenId] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useMemo(() => {
    void historyVersion;
    if (!address) return [];
    return listRecentMatches(chainId, address as Address);
  }, [address, chainId, historyVersion]);

  useEffect(() => {
    const onUpdate = () => setHistoryVersion((v) => v + 1);
    window.addEventListener('duel:v1:history-update', onUpdate);
    return () => window.removeEventListener('duel:v1:history-update', onUpdate);
  }, []);

  if (isConnecting) return null;

  if (!isConnected || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-950">
        <div className="text-center mb-10">
          <div className="text-7xl mb-5">⚔️</div>
          <h1 className="text-5xl font-bold text-white mb-3">Chain Cards</h1>
          <p className="text-gray-400 text-lg max-w-sm mx-auto">
            Duel Cards (V1) — connect your wallet to enter the arena.
          </p>
        </div>

        <ConnectWallet />

        <div className="mt-12 grid grid-cols-3 gap-6 text-center max-w-lg">
          {[
            { icon: '🃏', label: 'Commit lineup', sub: 'Hidden until reveal' },
            { icon: '💰', label: 'Stake ERC20', sub: 'Approve once per stake' },
            { icon: '⏳', label: 'Reveal on time', sub: 'Or risk forfeit' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="text-sm font-bold text-white">{item.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        <div className="rounded-2xl border border-purple-800 bg-gradient-to-br from-purple-950 to-gray-900 p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Ready to battle?</h2>
            <p className="text-gray-400 mt-1">Create a challenge, share the matchId, and reveal later.</p>
          </div>
          <Link
            href="/create"
            className="shrink-0 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-3 font-bold text-white transition-colors text-sm"
          >
            + Create Challenge
          </Link>
        </div>

        <section>
          <h3 className="text-lg font-bold text-white mb-4">Open match by ID</h3>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">matchId</label>
              <input
                value={openId}
                onChange={(e) => setOpenId(e.target.value)}
                placeholder="e.g. 1"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none font-mono"
              />
            </div>
            <Link
              href={openId ? `/bet/${openId}` : '#'}
              className={[
                'rounded-xl px-6 py-3 font-bold text-white transition-colors text-sm text-center',
                openId ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 cursor-not-allowed opacity-60',
              ].join(' ')}
              aria-disabled={!openId}
              onClick={(e) => { if (!openId) e.preventDefault(); }}
            >
              Open
            </Link>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-bold text-white mb-4">My recent matches (this device)</h3>
          {history.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
              No local history yet. Create or accept a match, or open by matchId.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <RecentMatchRow
                  key={item.matchId}
                  matchId={BigInt(item.matchId)}
                  role={item.role}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-lg font-bold text-white mb-4">Recent open challenges (on-chain)</h3>
          <RecentOpenChallenges />
        </section>
      </main>
    </div>
  );
}

function RecentMatchRow({ matchId, role }: { matchId: bigint; role: 'creator' | 'opponent' }) {
  const { matchInfo } = useGetMatchInfo(matchId);
  const status =
    !matchInfo
      ? 'Loading…'
      : matchInfo.opponent === '0x0000000000000000000000000000000000000000'
      ? 'Open'
      : !matchInfo.revealedCreator || !matchInfo.revealedOpponent
      ? 'Waiting reveal'
      : 'Revealed';

  const href =
    matchInfo && matchInfo.opponent !== '0x0000000000000000000000000000000000000000'
      ? `/battle/${matchId.toString()}`
      : `/bet/${matchId.toString()}`;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 hover:border-gray-600 transition-colors"
    >
      <div className="min-w-0">
        <div className="font-medium text-white truncate font-mono text-sm">Match #{matchId.toString()}</div>
        <div className="text-xs text-gray-500">
          Role: <span className="text-gray-300">{role}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold text-yellow-400">{status}</div>
      </div>
    </Link>
  );
}

function RecentOpenChallenges() {
  const { address } = useAccount();
  const chainId = useChainId();
  const nextMatchIdRead = useNextMatchId();

  const duelGameAddress = useMemo(() => {
    try {
      return getDuelGameAddress(chainId);
    } catch {
      return null;
    }
  }, [chainId]);

  const nextMatchId = nextMatchIdRead.data as bigint | undefined;
  const ids = useMemo(() => {
    if (nextMatchId === undefined) return [];
    const n = Number(nextMatchId);
    const start = Math.max(0, n - 20);
    return Array.from({ length: n - start }, (_, i) => BigInt(start + i));
  }, [nextMatchId]);

  const reads = useReadContracts({
    allowFailure: true,
    contracts: duelGameAddress
      ? ids.map((id) => ({
          address: duelGameAddress,
          abi: DuelGameArtifact.abi as Abi,
          functionName: 'getMatchInfo' as const,
          args: [id] as const,
        }))
      : [],
    query: { enabled: Boolean(duelGameAddress) && ids.length > 0 },
  });

  const openIds = useMemo(() => {
    const out: bigint[] = [];
    const results = reads.data ?? [];
    for (let i = 0; i < results.length; i++) {
      const result = (results[i] as { result?: unknown } | undefined)?.result;
      if (!result || typeof result !== 'object') continue;
      const t = result as Record<string, unknown> & { [index: number]: unknown };
      const creator = (t.creator ?? t[2]) as unknown;
      const opponent = (t.opponent ?? t[3]) as unknown;
      if (
        typeof opponent === 'string' &&
        opponent.toLowerCase() === '0x0000000000000000000000000000000000000000'
      ) {
        if (address && typeof creator === 'string' && creator.toLowerCase() === address.toLowerCase()) {
          continue; // don't show your own match as "open" (you can't accept yourself)
        }
        out.push(ids[i]);
      }
    }
    return out.slice().reverse();
  }, [address, ids, reads.data]);

  if (!duelGameAddress) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-500">
        Missing `NEXT_PUBLIC_DUELGAME_ADDRESS_{chainId}` for this network.
      </div>
    );
  }

  if (reads.isLoading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (openIds.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-500">
        No open challenges found in the last 20 matches.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {openIds.map((id) => (
        <Link
          key={id.toString()}
          href={`/bet/${id.toString()}`}
          className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 hover:border-gray-600 transition-colors"
        >
          <div className="font-medium text-white font-mono text-sm">Match #{id.toString()}</div>
          <span className="shrink-0 rounded-lg bg-green-700 hover:bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors">
            Accept
          </span>
        </Link>
      ))}
    </div>
  );
}
