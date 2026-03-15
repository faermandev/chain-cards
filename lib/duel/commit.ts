import { encodeAbiParameters, keccak256, type Address } from 'viem';

export function computeCommitHash(params: {
  matchId: bigint;
  player: Address;
  lineup: bigint[];
  salt32: `0x${string}`; // bytes32
}) {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256[]' },
      { type: 'bytes32' },
    ],
    [params.matchId, params.player, params.lineup, params.salt32],
  );
  return keccak256(encoded);
}

export function validateLineup(params: { rounds: number; lineup: bigint[] }) {
  if (params.lineup.length !== params.rounds) {
    throw new Error(`Lineup must have exactly ${params.rounds} card(s).`);
  }
  const set = new Set(params.lineup.map((x) => x.toString()));
  if (set.size !== params.lineup.length) {
    throw new Error('Lineup cannot contain duplicate card IDs.');
  }
}

export function validateSalt32(salt32: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt32)) {
    throw new Error('salt must be a bytes32 (0x + 64 hex chars).');
  }
}

