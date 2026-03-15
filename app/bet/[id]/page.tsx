'use client';

import { useMemo, useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import CardSelector from '@/components/CardSelector';
import { useGameUser } from '@/hooks/useGameUser';
import { useAcceptChallenge, useCancelUnaccepted, useGetMatchInfo, useStakeToken } from '@/lib/contracts/duelGame';
import { useApproveErc20, useErc20Allowance, useErc20Balance, useErc20Decimals, useErc20Symbol } from '@/lib/contracts/erc20';
import { computeCommitHash, validateLineup } from '@/lib/duel/commit';
import { addRecentMatch } from '@/lib/duel/history';
import { exportSecretJson, generateSalt32, saveSecret } from '@/lib/duel/secrets';
import { formatUnits, type Address } from 'viem';
import { useChainId } from 'wagmi';

export default function BetPage({ params }: { params: Promise<{ id: string }> }) {
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
  const accept = useAcceptChallenge();
  const cancel = useCancelUnaccepted();
  const stakeTokenRead = useStakeToken();
  const stakeToken = stakeTokenRead.data as Address | undefined;

  const decimalsRead = useErc20Decimals(stakeToken);
  const symbolRead = useErc20Symbol(stakeToken);
  const decimals = (decimalsRead.data as number | undefined) ?? 18;
  const symbol = (symbolRead.data as string | undefined) ?? 'TOKEN';

  const [selected, setSelected] = useState<(bigint | null)[]>([]);
  const [activeRound, setActiveRound] = useState(0);
  const [error, setError] = useState('');
  const [secretSaved, setSecretSaved] = useState(false);

  useEffect(() => {
    if (!isConnected) router.replace('/');
  }, [isConnected, router]);

  const rounds = matchInfo?.config.rounds;
  useEffect(() => {
    if (!rounds) return;
    setSelected(Array.from({ length: rounds }, () => null));
    setActiveRound(0);
    setSecretSaved(false);
  }, [rounds]);

  function handleChange(round: number, cardId: bigint | null) {
    setSelected((prev) => {
      const next = [...prev];
      next[round] = cardId;
      return next as (bigint | null)[];
    });
  }

  const duelGameAddress = accept.duelGameAddress as Address | undefined;
  const stake = matchInfo?.config.stake;
  const balanceRead = useErc20Balance(stakeToken, address as Address | undefined);
  const allowanceRead = useErc20Allowance(stakeToken, address as Address | undefined, duelGameAddress);
  const approve = useApproveErc20(stakeToken);
  const tokenReady = Boolean(stakeToken && duelGameAddress && balanceRead.data !== undefined && allowanceRead.data !== undefined);
  const tokenReadyReason = (() => {
    if (!address) return 'Connect wallet to load token/allowance.';
    if (!duelGameAddress) return accept.addressError ?? `Missing DuelGame address for chainId ${chainId}.`;
    if (stakeTokenRead.isLoading) return 'Reading stakeToken()…';
    if (stakeTokenRead.error) return `Failed to read stakeToken(): ${(stakeTokenRead.error as Error).message}`;
    if (!stakeToken) return 'Waiting for stake token address…';
    if (decimalsRead.isLoading || symbolRead.isLoading) return 'Loading token metadata…';
    if (balanceRead.isLoading) return 'Reading balance…';
    if (allowanceRead.isLoading) return 'Reading allowance…';
    return null;
  })();

  const needsApprove =
    stake !== undefined &&
    duelGameAddress !== undefined &&
    allowanceRead.data !== undefined &&
    (allowanceRead.data as bigint) < stake;

  useEffect(() => {
    if (!approve.isSuccess) return;
    allowanceRead.refetch();
    balanceRead.refetch();
  }, [allowanceRead, approve.isSuccess, balanceRead]);

  const insufficientBalance =
    stake !== undefined && balanceRead.data !== undefined && (balanceRead.data as bigint) < stake;

  const allSelected = selected.length > 0 && selected.every((s) => s !== null);

  function handleAccept() {
    if (!matchInfo || matchId === null || !address) return;
    if (selected.some((s) => s === null)) { setError('Select a card for every round.'); return; }
    if (insufficientBalance) { setError('Insufficient balance to accept this challenge.'); return; }
    if (needsApprove) { setError('Approval required before accepting.'); return; }

    const lineup = selected.filter(Boolean) as bigint[];
    try {
      validateLineup({ rounds: matchInfo.config.rounds, lineup });
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setError('');
    try {
      const salt32 = generateSalt32();
      saveSecret({ chainId, matchId, player: address as Address, lineup, salt32 });
      setSecretSaved(true);
      const commitHash = computeCommitHash({
        matchId,
        player: address as Address,
        lineup,
        salt32,
      });
      accept.acceptChallenge({ matchId, commitHash });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!accept.isSuccess || matchId === null || !address) return;
    addRecentMatch(chainId, address as Address, { matchId: matchId.toString(), role: 'opponent' });
    router.replace(`/battle/${matchId.toString()}`);
  }, [accept.isSuccess, address, chainId, matchId, router]);

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
  const hasOpponent = matchInfo.opponent.toLowerCase() !== '0x0000000000000000000000000000000000000000';

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Match #{matchId.toString()}
              </h1>
              <p className="text-gray-400 mt-1 font-mono text-sm">
                Creator: {matchInfo.creator}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-yellow-400">
                {formatUnits(matchInfo.config.stake, decimals)} {symbol}
              </div>
              <div className="text-sm text-gray-400">stake per player</div>
            </div>
          </div>
        </div>

        {hasOpponent && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
            This match already has an opponent.{' '}
            <Link href={`/battle/${matchId.toString()}`} className="text-purple-300 underline">
              Open battle view
            </Link>
            .
          </div>
        )}

        {!hasOpponent && isCreator && (
          <div className="space-y-6">
            <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-5 text-center">
              <div className="text-2xl mb-2">⏳</div>
              <h2 className="text-lg font-bold text-yellow-300">Waiting for an opponent</h2>
              <p className="text-sm text-yellow-500 mt-1">
                Share this matchId with someone to accept. Your lineup is hidden until reveal.
              </p>
              <div className="mt-3 text-xs text-gray-400 font-mono">
                matchId: {matchId.toString()}
              </div>
              <Link href="/" className="mt-4 inline-block text-sm text-gray-400 hover:text-gray-200 underline">
                ← Back to lobby
              </Link>
            </div>

            <button
              onClick={() => cancel.cancelUnaccepted(matchId)}
              disabled={cancel.isPending || cancel.isConfirming}
              className="w-full rounded-xl py-3 font-bold text-white transition-colors bg-red-700 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {cancel.isPending || cancel.isConfirming ? 'Cancelling…' : 'Cancel unaccepted match'}
            </button>
          </div>
        )}

        {!hasOpponent && !isCreator && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
              <div className="flex gap-3">
                <div className="text-2xl">🔒</div>
                <div>
                  <p className="font-medium text-gray-300">Creator&#39;s lineup is hidden</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    You will commit your lineup now, then reveal later. Save your secret (lineup + salt).
                  </p>
                </div>
              </div>
            </div>

            {insufficientBalance && (
              <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-center">
                <p className="text-red-400 font-medium">
                  Insufficient balance. You need {formatUnits(matchInfo.config.stake, decimals)} {symbol}.
                </p>
              </div>
            )}

            {!insufficientBalance && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Pick your lineup</h2>
                  <p className="text-gray-400 text-sm mb-4">
                    {matchInfo.config.rounds} rounds. No duplicates allowed.
                  </p>
                  {matchInfo.config.rounds > 5 && (
                    <div className="mb-4 rounded-xl border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-200">
                      This V1 UI only shows cardIds 1..5. You need {matchInfo.config.rounds} unique cards to accept.
                    </div>
                  )}
                  <CardSelector
                    rounds={matchInfo.config.rounds}
                    selected={selected}
                    onChange={handleChange}
                    activeRound={activeRound}
                    onRoundSelect={setActiveRound}
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}
                {!tokenReady && (
                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center text-xs text-gray-400">
                    {tokenReadyReason ?? 'Loading token/allowance…'}
                  </div>
                )}

                {needsApprove && duelGameAddress && stake !== undefined && (
                  <button
                    type="button"
                    onClick={() => approve.approve(duelGameAddress, stake)}
                    disabled={approve.isPending || approve.isConfirming}
                    className="w-full rounded-xl py-3 font-bold text-white transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {approve.isPending || approve.isConfirming ? 'Approving…' : 'Approve stake'}
                  </button>
                )}
                {approve.error && (
                  <p className="text-sm text-red-400">
                    Approve failed: {(approve.error as Error).message}
                  </p>
                )}

                <button
                  onClick={handleAccept}
                  disabled={!tokenReady || !allSelected || accept.isPending || accept.isConfirming || needsApprove || matchInfo.config.rounds > 5}
                  className={[
                    'w-full rounded-xl py-4 font-bold text-white text-lg transition-colors',
                    tokenReady && allSelected && !accept.isPending && !accept.isConfirming && !needsApprove && matchInfo.config.rounds <= 5
                      ? 'bg-green-600 hover:bg-green-500'
                      : 'bg-gray-700 cursor-not-allowed opacity-60',
                  ].join(' ')}
                >
                  {accept.isPending || accept.isConfirming
                    ? 'Accepting…'
                    : `Accept (stake ${formatUnits(matchInfo.config.stake, decimals)} ${symbol})`}
                </button>

                {secretSaved && address && (
                  <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-400">
                      Secret saved locally for matchId <span className="font-mono text-gray-200">{matchId.toString()}</span>.
                    </div>
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
                      Export Secret JSON
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
