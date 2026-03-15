'use client';

import { useMemo, useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { useGameUser } from '@/hooks/useGameUser';
import { useClaimForfeit, useGetMatchInfo, useReveal, useStakeToken } from '@/lib/contracts/duelGame';
import { useErc20Decimals, useErc20Symbol } from '@/lib/contracts/erc20';
import { deleteSecret, exportSecretJson, importSecretJson, loadSecret } from '@/lib/duel/secrets';
import { validateLineup, validateSalt32 } from '@/lib/duel/commit';
import { formatUnits, type Address } from 'viem';
import { useChainId } from 'wagmi';

export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, address, isConnected } = useGameUser();
  const chainId = useChainId();

  const matchId = useMemo(() => {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }, [id]);

  const { matchInfo, addressError } = useGetMatchInfo(matchId ?? undefined);
  const reveal = useReveal();
  const forfeit = useClaimForfeit();

  const stakeTokenRead = useStakeToken();
  const stakeToken = stakeTokenRead.data as Address | undefined;
  const decimalsRead = useErc20Decimals(stakeToken);
  const symbolRead = useErc20Symbol(stakeToken);
  const decimals = (decimalsRead.data as number | undefined) ?? 18;
  const symbol = (symbolRead.data as string | undefined) ?? 'TOKEN';

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [secretJsonInput, setSecretJsonInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isConnected) router.replace('/');
  }, [id, isConnected, router]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!user || matchId === null) return null;

  if (!matchInfo) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
            Loading match #{id}…
          </div>
          {addressError && (
            <div className="mt-4 rounded-xl border border-red-800 bg-red-950/30 p-4 text-red-300 text-sm">
              {addressError}
            </div>
          )}
        </main>
      </div>
    );
  }

  const isCreator = matchInfo.creator.toLowerCase() === user.id;
  const isOpponent = address ? matchInfo.opponent.toLowerCase() === (address as string).toLowerCase() : false;
  const isParticipant = isCreator || isOpponent;

  const revealDeadlineSec = Number(matchInfo.revealDeadline);
  const hasDeadline = revealDeadlineSec > 0;
  const secondsLeft = hasDeadline ? Math.max(0, revealDeadlineSec - nowSec) : null;
  const deadlinePassed = hasDeadline ? nowSec > revealDeadlineSec : false;

  const secret = address
    ? loadSecret({ chainId, matchId, player: address as Address })
    : null;
  const secretForThisPlayer = secret && address && secret.player.toLowerCase() === (address as string).toLowerCase();
  const myRevealed = isCreator ? matchInfo.revealedCreator : isOpponent ? matchInfo.revealedOpponent : false;

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Match #{matchId.toString()}</h1>
              <div className="text-sm text-gray-400 font-mono mt-1">Creator: {matchInfo.creator}</div>
              <div className="text-sm text-gray-400 font-mono">Opponent: {matchInfo.opponent}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-yellow-400">
                Stake: {formatUnits(matchInfo.config.stake, decimals)} {symbol}
              </div>
              <div className="text-xs text-gray-500">Rounds: {matchInfo.config.rounds}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-gray-300">
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <div className="text-xs text-gray-500">Revealed (creator)</div>
              <div className="font-bold">{matchInfo.revealedCreator ? 'Yes' : 'No'}</div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
              <div className="text-xs text-gray-500">Revealed (opponent)</div>
              <div className="font-bold">{matchInfo.revealedOpponent ? 'Yes' : 'No'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
            <div className="text-xs text-gray-500">Reveal deadline</div>
            {!hasDeadline ? (
              <div className="font-bold">—</div>
            ) : (
              <div className="font-bold">
                {new Date(revealDeadlineSec * 1000).toLocaleString()} —{' '}
                {deadlinePassed ? 'passed' : `${secondsLeft}s left`}
              </div>
            )}
          </div>
        </div>

        {!isParticipant && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
            Connect the creator/opponent wallet to reveal or claim forfeit.
          </div>
        )}

        {isParticipant && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <h2 className="text-xl font-bold text-white">Your secret</h2>

            <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-200">
              Without your secret (lineup + salt), you cannot reveal.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-gray-300">
                Status:{' '}
                <span className={secretForThisPlayer ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {secretForThisPlayer ? 'Found on this device' : 'Missing'}
                </span>
              </div>

              {secretForThisPlayer && address && (
                <>
                  <button
                    onClick={() => {
                      const json = exportSecretJson({ chainId, matchId, player: address as Address });
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `duel-secret-${chainId}-${matchId.toString()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs font-bold text-white transition-colors"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => {
                      deleteSecret({ chainId, matchId, player: address as Address });
                      router.refresh();
                    }}
                    className="rounded-lg border border-red-800 bg-red-950/40 hover:bg-red-950 px-3 py-2 text-xs font-bold text-red-200 transition-colors"
                  >
                    Delete local secret
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Import secret JSON</label>
              <textarea
                value={secretJsonInput}
                onChange={(e) => setSecretJsonInput(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none font-mono"
                placeholder='{"matchId":"1","player":"0x...","lineup":["1","2","3"],"salt32":"0x...","createdAt":...}'
              />
              <button
                onClick={() => {
                  try {
                    importSecretJson({ chainId, json: secretJsonInput });
                    setSecretJsonInput('');
                    setError('');
                    router.refresh();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
                className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs font-bold text-white transition-colors"
              >
                Import
              </button>
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}
          </div>
        )}

        {isParticipant && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-3">
            <h2 className="text-xl font-bold text-white">Actions</h2>

            <button
              disabled={!secretForThisPlayer || myRevealed || reveal.isPending || reveal.isConfirming || !address}
              onClick={() => {
                if (!secret || !address) return;
                try {
                  validateSalt32(secret.salt32);
                  const lineup = secret.lineup.map((x) => BigInt(x));
                  validateLineup({ rounds: matchInfo.config.rounds, lineup });
                  if (secret.player.toLowerCase() !== (address as string).toLowerCase()) {
                    throw new Error('Secret player does not match connected wallet.');
                  }
                  reveal.reveal({ matchId, lineup, salt32: secret.salt32 });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className={[
                'w-full rounded-xl py-3 font-bold text-white transition-colors',
                secretForThisPlayer && !myRevealed
                  ? 'bg-purple-600 hover:bg-purple-500'
                  : 'bg-gray-700 cursor-not-allowed opacity-60',
              ].join(' ')}
            >
              {myRevealed ? 'Already revealed' : reveal.isPending || reveal.isConfirming ? 'Revealing…' : 'Reveal'}
            </button>

            <button
              disabled={!deadlinePassed || forfeit.isPending || forfeit.isConfirming || (matchInfo.revealedCreator && matchInfo.revealedOpponent)}
              onClick={() => forfeit.claimForfeit(matchId)}
              className={[
                'w-full rounded-xl py-3 font-bold text-white transition-colors',
                deadlinePassed && !(matchInfo.revealedCreator && matchInfo.revealedOpponent)
                  ? 'bg-red-700 hover:bg-red-600'
                  : 'bg-gray-700 cursor-not-allowed opacity-60',
              ].join(' ')}
            >
              {forfeit.isPending || forfeit.isConfirming ? 'Claiming…' : 'Claim forfeit'}
            </button>

            <div className="text-xs text-gray-500">
              If the contract doesn’t expose the winner via `getMatchInfo`, this page only shows state and your tx receipts.
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/"
            className="flex-1 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 py-3 text-center font-medium text-white transition-colors"
          >
            ← Back to Lobby
          </Link>
          <Link
            href={`/bet/${matchId.toString()}`}
            className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-500 py-3 text-center font-bold text-white transition-colors"
          >
            Match page
          </Link>
        </div>
      </main>
    </div>
  );
}
