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
import { formatUnits, type AbiEvent, type Address, type PublicClient } from 'viem';
import { useChainId, usePublicClient } from 'wagmi';
import { DUELGAME_ABI } from '@/lib/contracts/duelGame';
import { getDuelGameAddress } from '@/lib/contracts/addresses';
import { getDuelGameFromBlock } from '@/lib/contracts/fromBlocks';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getEventByName(abi: unknown, name: string): AbiEvent | null {
  if (!Array.isArray(abi)) return null;
  const items = abi as readonly { type?: string; name?: string }[];
  const found = items.find((x) => x.type === 'event' && x.name === name);
  return (found as AbiEvent | undefined) ?? null;
}

async function getLogsInChunks(params: {
  publicClient: PublicClient;
  address: Address;
  event: AbiEvent;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
}) {
  const out: unknown[] = [];
  for (let start = params.fromBlock; start <= params.toBlock; start += params.chunkSize) {
    const end = start + params.chunkSize - 1n;
    const toBlock = end > params.toBlock ? params.toBlock : end;
    const chunk = await params.publicClient.getLogs({
      address: params.address,
      event: params.event,
      fromBlock: start,
      toBlock,
    });
    out.push(...chunk);
  }
  return out;
}

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
  const publicClient = usePublicClient();

  const stakeTokenRead = useStakeToken();
  const stakeToken = stakeTokenRead.data as Address | undefined;
  const decimalsRead = useErc20Decimals(stakeToken);
  const symbolRead = useErc20Symbol(stakeToken);
  const decimals = (decimalsRead.data as number | undefined) ?? 18;
  const symbol = (symbolRead.data as string | undefined) ?? 'TOKEN';

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [secretJsonInput, setSecretJsonInput] = useState('');
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState<{
    winner: Address;
    winsCreator?: number;
    winsOpponent?: number;
    draws?: number;
    pot?: bigint;
    kind: 'matchResolved' | 'forfeit';
  } | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) router.replace('/');
  }, [id, isConnected, router]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Load winner/result from events (getMatchInfo doesn't expose it)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!publicClient || matchId === null) return;
      setResolutionError(null);

      let duelGameAddress: Address;
      try {
        duelGameAddress = getDuelGameAddress(chainId);
      } catch (e) {
        setResolution(null);
        setResolutionError((e as Error).message);
        return;
      }

      const fromBlock = getDuelGameFromBlock(chainId);
      if (fromBlock === undefined && chainId !== 31337) {
        setResolution(null);
        setResolutionError(
          `Set NEXT_PUBLIC_DUELGAME_FROM_BLOCK_${chainId} to enable winner lookup on this RPC.`,
        );
        return;
      }

      const matchResolved = getEventByName(DUELGAME_ABI, 'MatchResolved');
      const forfeitClaimed = getEventByName(DUELGAME_ABI, 'ForfeitClaimed');
      if (!matchResolved || !forfeitClaimed) {
        setResolution(null);
        setResolutionError('DuelGame ABI missing MatchResolved/ForfeitClaimed events.');
        return;
      }

      try {
        const latest = await publicClient.getBlockNumber();
        const start = fromBlock ?? 0n;
        const chunkSize = chainId === 31337 ? 50_000n : 100n;

        const logsResolved = await getLogsInChunks({
          publicClient: publicClient as PublicClient,
          address: duelGameAddress,
          event: matchResolved,
          fromBlock: start,
          toBlock: latest,
          chunkSize,
        });

        const resolvedForMatch = logsResolved.filter((l) => {
          const args = (l as { args?: { matchId?: bigint } }).args;
          return args?.matchId === matchId;
        });
        const lastResolved = resolvedForMatch[resolvedForMatch.length - 1] as
          | {
              args?: {
                winner?: Address;
                winsCreator?: bigint;
                winsOpponent?: bigint;
                draws?: bigint;
                pot?: bigint;
              };
            }
          | undefined;

        if (lastResolved?.args?.winner) {
          if (!cancelled) {
            setResolution({
              kind: 'matchResolved',
              winner: lastResolved.args.winner,
              winsCreator: lastResolved.args.winsCreator ? Number(lastResolved.args.winsCreator) : undefined,
              winsOpponent: lastResolved.args.winsOpponent ? Number(lastResolved.args.winsOpponent) : undefined,
              draws: lastResolved.args.draws ? Number(lastResolved.args.draws) : undefined,
              pot: lastResolved.args.pot,
            });
          }
          return;
        }

        const logsForfeit = await getLogsInChunks({
          publicClient: publicClient as PublicClient,
          address: duelGameAddress,
          event: forfeitClaimed,
          fromBlock: start,
          toBlock: latest,
          chunkSize,
        });

        const forfeitForMatch = logsForfeit.filter((l) => {
          const args = (l as { args?: { matchId?: bigint } }).args;
          return args?.matchId === matchId;
        });
        const lastForfeit = forfeitForMatch[forfeitForMatch.length - 1] as
          | { args?: { winner?: Address; pot?: bigint } }
          | undefined;

        if (!cancelled && lastForfeit?.args?.winner) {
          setResolution({
            kind: 'forfeit',
            winner: lastForfeit.args.winner,
            pot: lastForfeit.args.pot,
          });
        } else if (!cancelled) {
          setResolution(null);
        }
      } catch (e) {
        if (cancelled) return;
        setResolution(null);
        setResolutionError((e as Error).message);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [chainId, matchId, publicClient]);

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
  const hasWinner = Boolean(resolution?.winner);
  const iWon = hasWinner && address && resolution!.winner.toLowerCase() === (address as string).toLowerCase();

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <div
          className={[
            'rounded-2xl border p-6 space-y-3',
            hasWinner
              ? iWon
                ? 'border-yellow-500 bg-gradient-to-br from-yellow-950 to-gray-900'
                : 'border-red-700 bg-gradient-to-br from-red-950 to-gray-900'
              : 'border-gray-800 bg-gray-900',
          ].join(' ')}
        >
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

          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-200">
            <div className="text-xs text-gray-500">Result</div>
            {resolutionError ? (
              <div className="text-gray-400">{resolutionError}</div>
            ) : resolution ? (
              <div className="font-bold">
                {iWon ? 'You won' : `Winner: ${shortAddr(resolution.winner)}`}
                {resolution.kind === 'forfeit' && <span className="ml-2 text-xs text-red-300">(forfeit)</span>}
                {resolution.pot !== undefined && (
                  <span className="ml-2 text-yellow-300">
                    — pot {formatUnits(resolution.pot, decimals)} {symbol}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-gray-400">Not resolved yet</div>
            )}

            {resolution?.winsCreator !== undefined && resolution?.winsOpponent !== undefined && (
              <div className="mt-1 text-xs text-gray-400">
                Score — creator: {resolution.winsCreator}, opponent: {resolution.winsOpponent}
                {resolution.draws !== undefined ? `, draws: ${resolution.draws}` : ''}
              </div>
            )}
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
