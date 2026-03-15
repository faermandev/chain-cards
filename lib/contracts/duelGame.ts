import DuelGameArtifact from '@/lib/abi/DuelGame.json';
import { getDuelGameAddress } from '@/lib/contracts/addresses';
import {
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { decodeEventLog, type Abi, type Address, type Hash } from 'viem';

export const DUELGAME_ABI = DuelGameArtifact.abi as Abi;

export type MatchConfig = {
  stake: bigint;
  rounds: number;
  elementalMultiplierBps: number;
  useElementAdvantage: boolean;
  useTotalStatsTiebreaker: boolean;
};

export type MatchInfo = {
  config: MatchConfig;
  state: number;
  creator: Address;
  opponent: Address;
  revealedCreator: boolean;
  revealedOpponent: boolean;
  revealDeadline: bigint;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type TupleLike = Record<string, unknown> & { [index: number]: unknown };
type Topics = [] | [`0x${string}`, ...`0x${string}`[]];

function toBigInt(value: unknown, fallback: bigint) {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value) return BigInt(value);
  } catch {
    // ignore
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function useDuelGameAddress() {
  const chainId = useChainId();
  try {
    return { address: getDuelGameAddress(chainId), error: null as string | null };
  } catch (err) {
    return { address: undefined, error: (err as Error).message };
  }
}

function normalizeMatchConfig(raw: unknown): MatchConfig {
  const t = (raw ?? {}) as TupleLike;
  const stake = toBigInt(t.stake ?? t[0], 0n);
  const rounds = toNumber(t.rounds ?? t[1], 0);
  const elementalMultiplierBps = toNumber(t.elementalMultiplierBps ?? t[2], 0);
  const useElementAdvantage = Boolean(t.useElementAdvantage ?? t[3]);
  const useTotalStatsTiebreaker = Boolean(t.useTotalStatsTiebreaker ?? t[4]);
  return { stake, rounds, elementalMultiplierBps, useElementAdvantage, useTotalStatsTiebreaker };
}

function normalizeMatchInfo(raw: unknown): MatchInfo {
  const t = (raw ?? {}) as TupleLike;
  const configRaw = (t.config ?? t[0]) as unknown;
  return {
    config: normalizeMatchConfig(configRaw),
    state: toNumber(t.state ?? t[1], 0),
    creator: (t.creator ?? t[2]) as Address,
    opponent: (t.opponent ?? t[3]) as Address,
    revealedCreator: Boolean(t.revealedCreator ?? t[4]),
    revealedOpponent: Boolean(t.revealedOpponent ?? t[5]),
    revealDeadline: toBigInt(t.revealDeadline ?? t[6], 0n),
  };
}

export function useStakeToken() {
  const { address: duelGameAddress } = useDuelGameAddress();
  return useReadContract({
    address: duelGameAddress,
    abi: DUELGAME_ABI,
    functionName: 'stakeToken',
    query: { enabled: Boolean(duelGameAddress) },
  });
}

export function useCardRegistryAddress() {
  const { address: duelGameAddress } = useDuelGameAddress();
  return useReadContract({
    address: duelGameAddress,
    abi: DUELGAME_ABI,
    functionName: 'cardRegistry',
    query: { enabled: Boolean(duelGameAddress) },
  });
}

export function useNextMatchId() {
  const { address: duelGameAddress } = useDuelGameAddress();
  return useReadContract({
    address: duelGameAddress,
    abi: DUELGAME_ABI,
    functionName: 'nextMatchId',
    query: { enabled: Boolean(duelGameAddress) },
  });
}

export function useGetMatchInfo(matchId: bigint | undefined) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const read = useReadContract({
    address: duelGameAddress,
    abi: DUELGAME_ABI,
    functionName: 'getMatchInfo',
    args: matchId !== undefined ? [matchId] : undefined,
    query: { enabled: Boolean(duelGameAddress) && matchId !== undefined, refetchInterval: 2500 },
  });

  return {
    ...read,
    addressError,
    matchInfo: read.data ? normalizeMatchInfo(read.data) : null,
    duelGameAddress,
  };
}

function extractChallengeCreatedMatchId(receipt: unknown): bigint | null {
  if (!receipt || typeof receipt !== 'object') return null;
  const logs = (receipt as { logs?: unknown }).logs;
  if (!Array.isArray(logs) || logs.length === 0) return null;
  for (const log of logs) {
    if (!log || typeof log !== 'object') continue;
    try {
      const topicsInput = (log as { topics?: unknown }).topics;
      const topicsArray = Array.isArray(topicsInput) ? ([...topicsInput] as unknown[]) : [];
      const topics = topicsArray as unknown as Topics;

      const decoded = decodeEventLog({
        abi: DUELGAME_ABI,
        data: (log as { data: `0x${string}` }).data,
        topics,
      });
      if (decoded.eventName === 'ChallengeCreated') {
        const args = decoded.args as unknown as { matchId?: bigint };
        if (typeof args.matchId === 'bigint') return args.matchId;
      }
    } catch {
      // ignore non-matching logs
    }
  }
  return null;
}

export function useCreateChallenge(opts?: { confirmations?: number }) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  const createdMatchId = extractChallengeCreatedMatchId(wait.data);

  function createChallenge(args: { config: MatchConfig; commitHash: Hash }) {
    if (!duelGameAddress) throw new Error(addressError ?? 'Missing DuelGame address.');
    writeContract({
      address: duelGameAddress,
      abi: DUELGAME_ABI,
      functionName: 'createChallenge',
      args: [
        {
          stake: args.config.stake,
          rounds: args.config.rounds,
          elementalMultiplierBps: args.config.elementalMultiplierBps,
          useElementAdvantage: args.config.useElementAdvantage,
          useTotalStatsTiebreaker: args.config.useTotalStatsTiebreaker,
        },
        args.commitHash,
      ],
    });
  }

  return {
    createChallenge,
    duelGameAddress,
    addressError,
    txHash,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    createdMatchId,
    error,
  };
}

export function useAcceptChallenge(opts?: { confirmations?: number }) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  function acceptChallenge(args: { matchId: bigint; commitHash: Hash }) {
    if (!duelGameAddress) throw new Error(addressError ?? 'Missing DuelGame address.');
    writeContract({
      address: duelGameAddress,
      abi: DUELGAME_ABI,
      functionName: 'acceptChallenge',
      args: [args.matchId, args.commitHash],
    });
  }

  return {
    acceptChallenge,
    duelGameAddress,
    addressError,
    txHash,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    error,
  };
}

export function useReveal(opts?: { confirmations?: number }) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  function reveal(args: { matchId: bigint; lineup: bigint[]; salt32: `0x${string}` }) {
    if (!duelGameAddress) throw new Error(addressError ?? 'Missing DuelGame address.');
    writeContract({
      address: duelGameAddress,
      abi: DUELGAME_ABI,
      functionName: 'reveal',
      args: [args.matchId, args.lineup, args.salt32],
    });
  }

  return {
    reveal,
    duelGameAddress,
    addressError,
    txHash,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    error,
  };
}

export function useCancelUnaccepted(opts?: { confirmations?: number }) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  function cancelUnaccepted(matchId: bigint) {
    if (!duelGameAddress) throw new Error(addressError ?? 'Missing DuelGame address.');
    writeContract({
      address: duelGameAddress,
      abi: DUELGAME_ABI,
      functionName: 'cancelUnaccepted',
      args: [matchId],
    });
  }

  return {
    cancelUnaccepted,
    duelGameAddress,
    addressError,
    txHash,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    error,
  };
}

export function useClaimForfeit(opts?: { confirmations?: number }) {
  const { address: duelGameAddress, error: addressError } = useDuelGameAddress();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  function claimForfeit(matchId: bigint) {
    if (!duelGameAddress) throw new Error(addressError ?? 'Missing DuelGame address.');
    writeContract({
      address: duelGameAddress,
      abi: DUELGAME_ABI,
      functionName: 'claimForfeit',
      args: [matchId],
    });
  }

  return {
    claimForfeit,
    duelGameAddress,
    addressError,
    txHash,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    error,
  };
}

export function getIsMatchOpen(matchInfo: MatchInfo) {
  return matchInfo.opponent === ZERO_ADDRESS;
}
