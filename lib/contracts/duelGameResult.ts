import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import type { AbiEvent, Address, PublicClient } from 'viem';
import { DUELGAME_ABI } from '@/lib/contracts/duelGame';
import { getDuelGameAddress } from '@/lib/contracts/addresses';
import { getDuelGameFromBlock } from '@/lib/contracts/fromBlocks';

export type MatchResolution =
  | {
      kind: 'matchResolved';
      winner: Address;
      pot?: bigint;
      winsCreator?: number;
      winsOpponent?: number;
      draws?: number;
    }
  | {
      kind: 'forfeit';
      winner: Address;
      pot?: bigint;
    };

function getEventByName(name: string): AbiEvent | null {
  if (!Array.isArray(DUELGAME_ABI)) return null;
  const items = DUELGAME_ABI as readonly { type?: string; name?: string }[];
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

function cacheKey(chainId: number, matchId: bigint) {
  return `${chainId}:${matchId.toString()}`;
}

const memoryCache = new Map<string, MatchResolution>();

export function useMatchResolution(params: { matchId: bigint; enabled: boolean }) {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [resolution, setResolution] = useState<MatchResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isEnabled = params.enabled && Boolean(publicClient);

  const cached = useMemo(() => memoryCache.get(cacheKey(chainId, params.matchId)) ?? null, [chainId, params.matchId]);

  useEffect(() => {
    if (!isEnabled) return;
    if (cached) {
      setResolution(cached);
      return;
    }

    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);

      let duelGameAddress: Address;
      try {
        duelGameAddress = getDuelGameAddress(chainId);
      } catch (e) {
        setLoading(false);
        setError((e as Error).message);
        return;
      }

      const fromBlock = getDuelGameFromBlock(chainId);
      if (fromBlock === undefined && chainId !== 31337) {
        setLoading(false);
        setError(`Missing NEXT_PUBLIC_DUELGAME_FROM_BLOCK_${chainId} (required for event lookup).`);
        return;
      }

      const matchResolved = getEventByName('MatchResolved');
      const forfeitClaimed = getEventByName('ForfeitClaimed');
      if (!matchResolved || !forfeitClaimed) {
        setLoading(false);
        setError('DuelGame ABI missing MatchResolved/ForfeitClaimed events.');
        return;
      }

      try {
        const latest = await (publicClient as PublicClient).getBlockNumber();
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
          return args?.matchId === params.matchId;
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
          const value: MatchResolution = {
            kind: 'matchResolved',
            winner: lastResolved.args.winner,
            winsCreator: lastResolved.args.winsCreator ? Number(lastResolved.args.winsCreator) : undefined,
            winsOpponent: lastResolved.args.winsOpponent ? Number(lastResolved.args.winsOpponent) : undefined,
            draws: lastResolved.args.draws ? Number(lastResolved.args.draws) : undefined,
            pot: lastResolved.args.pot,
          };
          memoryCache.set(cacheKey(chainId, params.matchId), value);
          if (!cancelled) setResolution(value);
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
          return args?.matchId === params.matchId;
        });
        const lastForfeit = forfeitForMatch[forfeitForMatch.length - 1] as
          | { args?: { winner?: Address; pot?: bigint } }
          | undefined;

        if (lastForfeit?.args?.winner) {
          const value: MatchResolution = {
            kind: 'forfeit',
            winner: lastForfeit.args.winner,
            pot: lastForfeit.args.pot,
          };
          memoryCache.set(cacheKey(chainId, params.matchId), value);
          if (!cancelled) setResolution(value);
          return;
        }

        if (!cancelled) setResolution(null);
      } catch (e) {
        if (cancelled) return;
        setResolution(null);
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [cached, chainId, isEnabled, params.enabled, params.matchId, publicClient]);

  const iWon =
    Boolean(userAddress && resolution?.winner) &&
    (resolution!.winner as string).toLowerCase() === (userAddress as string).toLowerCase();

  return { resolution, iWon, loading, error };
}

