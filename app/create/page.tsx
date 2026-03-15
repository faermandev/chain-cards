'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import CardSelector from '@/components/CardSelector';
import { useGameUser } from '@/hooks/useGameUser';
import {
  useCreateChallenge,
  useNextMatchId,
  useStakeToken,
} from '@/lib/contracts/duelGame';
import {
  useApproveErc20,
  useErc20Allowance,
  useErc20Balance,
  useErc20Decimals,
  useErc20Symbol,
} from '@/lib/contracts/erc20';
import { computeCommitHash, validateLineup } from '@/lib/duel/commit';
import { addRecentMatch } from '@/lib/duel/history';
import { exportSecretJson, generateSalt32, moveSecret, saveSecret } from '@/lib/duel/secrets';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useChainId } from 'wagmi';

function formatTokenAmount(amount: bigint, decimals: number, maxFractionDigits: number) {
  const full = formatUnits(amount, decimals);
  const [intPart, fracPart = ''] = full.split('.');
  if (maxFractionDigits <= 0) return intPart;
  const trimmedFrac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
}

export default function CreateBetPage() {
  const router = useRouter();
  const { user, address, isConnected } = useGameUser();
  const chainId = useChainId();
  const [rounds, setRounds] = useState(3);
  const [selected, setSelected] = useState<(bigint | null)[]>(Array.from({ length: 3 }, () => null));
  const [activeRound, setActiveRound] = useState(0);
  const [stakeInput, setStakeInput] = useState('1');
  const [useElementAdvantage, setUseElementAdvantage] = useState(true);
  const [useTotalStatsTiebreaker, setUseTotalStatsTiebreaker] = useState(true);
  const [elementalMultiplierBps, setElementalMultiplierBps] = useState(15000);
  const [error, setError] = useState('');
  const [secretSavedFor, setSecretSavedFor] = useState<bigint | null>(null);
  const [predictedMatchIdForTx, setPredictedMatchIdForTx] = useState<bigint | null>(null);

  useEffect(() => {
    if (!isConnected) router.replace('/');
  }, [isConnected, router]);

  const nextMatchIdRead = useNextMatchId();
  const stakeTokenRead = useStakeToken();
  const stakeToken = stakeTokenRead.data as Address | undefined;

  const decimalsRead = useErc20Decimals(stakeToken);
  const symbolRead = useErc20Symbol(stakeToken);
  const decimals = (decimalsRead.data as number | undefined) ?? 18;
  const symbol = (symbolRead.data as string | undefined) ?? 'TOKEN';

  const create = useCreateChallenge();
  const duelGameAddress = create.duelGameAddress as Address | undefined;

  const balanceRead = useErc20Balance(stakeToken, address as Address | undefined);
  const allowanceRead = useErc20Allowance(stakeToken, address as Address | undefined, duelGameAddress);
  const approve = useApproveErc20(stakeToken);

  const stakeUnits = (() => {
    try {
      return parseUnits(stakeInput || '0', decimals);
    } catch {
      return null;
    }
  })();

  const balance = balanceRead.data as bigint | undefined;
  const allowance = allowanceRead.data as bigint | undefined;
  const tokenReady = Boolean(stakeToken && duelGameAddress && balance !== undefined && allowance !== undefined);
  const tokenReadyReason = (() => {
    if (!address) return 'Connect wallet to load token/allowance.';
    if (!duelGameAddress) return create.addressError ?? `Missing DuelGame address for chainId ${chainId}.`;
    if (stakeTokenRead.isLoading) return 'Reading stakeToken()…';
    if (stakeTokenRead.error) return `Failed to read stakeToken(): ${(stakeTokenRead.error as Error).message}`;
    if (!stakeToken) return 'Waiting for stake token address…';
    if (decimalsRead.isLoading || symbolRead.isLoading) return 'Loading token metadata…';
    if (decimalsRead.error) return `Failed to read decimals(): ${(decimalsRead.error as Error).message}`;
    if (symbolRead.error) return `Failed to read symbol(): ${(symbolRead.error as Error).message}`;
    if (balanceRead.isLoading) return 'Reading balance…';
    if (balanceRead.error) return `Failed to read balance: ${(balanceRead.error as Error).message}`;
    if (allowanceRead.isLoading) return 'Reading allowance…';
    if (allowanceRead.error) return `Failed to read allowance: ${(allowanceRead.error as Error).message}`;
    if (balance === undefined || allowance === undefined) return 'Waiting for balance/allowance…';
    return null;
  })();
  const needsApprove =
    stakeUnits !== null &&
    duelGameAddress !== undefined &&
    allowance !== undefined &&
    allowance < stakeUnits;

  useEffect(() => {
    setSelected(Array.from({ length: rounds }, () => null));
    setActiveRound(0);
  }, [rounds]);

  function handleChange(round: number, cardId: bigint | null) {
    setSelected((prev) => {
      const next = [...prev];
      next[round] = cardId;
      return next as (bigint | null)[];
    });
  }

  function handleSubmit() {
    if (!user || !address) return;
    if (!duelGameAddress) { setError(create.addressError ?? 'Missing DuelGame address.'); return; }
    if (stakeUnits === null) { setError('Invalid stake amount.'); return; }
    if (stakeUnits <= 0n) { setError('Stake must be greater than 0.'); return; }
    if (balance !== undefined && balance < stakeUnits) {
      setError(`Insufficient balance. You need ${stakeInput} ${symbol}.`);
      return;
    }
    if (needsApprove) { setError(`Approval required to stake ${stakeInput} ${symbol}.`); return; }
    if (selected.some((s) => s === null)) { setError('Select a card for every round.'); return; }

    const lineup = selected.filter(Boolean) as bigint[];
    try {
      validateLineup({ rounds, lineup });
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    const predictedMatchId = nextMatchIdRead.data as bigint | undefined;
    if (predictedMatchId === undefined) {
      setError(
        'Cannot create challenge: DuelGame.nextMatchId() is not available (commitHash depends on matchId).',
      );
      return;
    }

    setError('');
    try {
      setPredictedMatchIdForTx(predictedMatchId);
      const salt32 = generateSalt32();
      saveSecret({
        chainId,
        matchId: predictedMatchId,
        player: address as Address,
        lineup,
        salt32,
      });
      setSecretSavedFor(predictedMatchId);

      const commitHash = computeCommitHash({
        matchId: predictedMatchId,
        player: address as Address,
        lineup,
        salt32,
      });

      create.createChallenge({
        config: {
          stake: stakeUnits,
          rounds,
          elementalMultiplierBps,
          useElementAdvantage,
          useTotalStatsTiebreaker,
        },
        commitHash,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!create.isSuccess || !address) return;
    const finalMatchId = (create.createdMatchId ?? predictedMatchIdForTx) as bigint | null;
    if (!finalMatchId) return;

    if (secretSavedFor && secretSavedFor !== finalMatchId) {
      moveSecret({
        chainId,
        fromMatchId: secretSavedFor,
        toMatchId: finalMatchId,
        player: address as Address,
      });
      setSecretSavedFor(finalMatchId);
    }
    addRecentMatch(chainId, address as Address, {
      matchId: finalMatchId.toString(),
      role: 'creator',
    });
    router.replace(`/bet/${finalMatchId.toString()}`);
  }, [address, chainId, create.createdMatchId, create.isSuccess, predictedMatchIdForTx, router, secretSavedFor]);

  if (!user) return null;

  const allSelected = selected.every((s) => s !== null);

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Create a Challenge</h1>
          <p className="text-gray-400 mt-1">
            Pick your lineup and stake. Your lineup stays hidden until you reveal.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Rounds</label>
              <div className="flex gap-2">
                {[3, 6, 9].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRounds(r)}
                    disabled={r > 5}
                    className={[
                      'rounded-lg border px-4 py-2 text-sm font-bold transition-colors',
                      rounds === r
                        ? 'border-purple-500 bg-purple-900 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500',
                      r > 5 ? 'opacity-50 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Lineup must have exactly {rounds} unique card IDs. (V1 UI exposes cardIds 1..5.)
              </p>
            </div>

            <div className="min-w-[240px]">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stake ({symbol})
              </label>
              <div className="flex gap-2">
                {['0.1', '1', '5', '10'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStakeInput(v)}
                    className={[
                      'rounded-lg border px-4 py-2 text-sm font-bold transition-colors',
                      stakeInput === v
                        ? 'border-purple-500 bg-purple-900 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500',
                    ].join(' ')}
                  >
                    {v}
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="decimal"
                  value={stakeInput}
                  onChange={(e) => setStakeInput(e.target.value)}
                  className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              {balance !== undefined && (
                <p className="text-xs text-gray-500 mt-2">
                  Your balance: {formatTokenAmount(balance, decimals, 6)} {symbol}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useElementAdvantage}
                onChange={(e) => setUseElementAdvantage(e.target.checked)}
                className="accent-purple-600"
              />
              Use element advantage
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useTotalStatsTiebreaker}
                onChange={(e) => setUseTotalStatsTiebreaker(e.target.checked)}
                className="accent-purple-600"
              />
              Total-stats tiebreaker
            </label>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Element multiplier (bps)</label>
              <input
                type="number"
                min={10000}
                max={30000}
                value={elementalMultiplierBps}
                onChange={(e) => setElementalMultiplierBps(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <CardSelector
          rounds={rounds}
          selected={selected}
          onChange={handleChange}
          activeRound={activeRound}
          onRoundSelect={setActiveRound}
        />

        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
          <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-200">
            <div className="font-bold mb-1">Important: save your secret</div>
            <div className="text-yellow-400">
              Without your secret (lineup + salt), you cannot reveal later.
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {needsApprove && duelGameAddress && stakeUnits !== null && (
            <button
              onClick={() => approve.approve(duelGameAddress, stakeUnits)}
              disabled={approve.isPending || approve.isConfirming}
              className="w-full rounded-xl py-3 font-bold text-white transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {approve.isPending || approve.isConfirming ? 'Approving…' : `Approve ${stakeInput} ${symbol}`}
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={!tokenReady || !allSelected || create.isPending || create.isConfirming || needsApprove}
            className={[
              'w-full rounded-xl py-3 font-bold text-white transition-colors',
              tokenReady && allSelected && !create.isPending && !create.isConfirming && !needsApprove
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-gray-700 cursor-not-allowed opacity-60',
            ].join(' ')}
          >
            {create.isPending || create.isConfirming ? 'Publishing…' : `Create Challenge (${stakeInput} ${symbol})`}
          </button>

          {!allSelected && (
            <p className="text-xs text-gray-500 text-center">
              Select a card for all rounds to continue.
            </p>
          )}
          {!tokenReady && (
            <div className="text-xs text-gray-500 text-center space-y-1">
              <div>{tokenReadyReason ?? 'Loading token/allowance…'}</div>
              <div className="font-mono">chainId: {chainId}</div>
            </div>
          )}

          {secretSavedFor !== null && address && (
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-400">
                Secret saved for predicted matchId <span className="font-mono text-gray-200">{secretSavedFor.toString()}</span>.
              </div>
              <button
                onClick={() => {
                  const json = exportSecretJson({ chainId, matchId: secretSavedFor, player: address as Address });
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `duel-secret-${chainId}-${secretSavedFor.toString()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs font-bold text-white transition-colors"
              >
                Export Secret JSON
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
