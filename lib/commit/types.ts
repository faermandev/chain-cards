export type MatchSecretStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'revealed'
  | 'resolved'
  | 'expired';

/** Local (and remote) representation of a match secret */
export interface MatchSecret {
  /** Internal row id (Supabase) — null before first sync */
  id?: string;
  /** On-chain match id — null until tx confirmed */
  matchId?: number | null;
  /** Transaction hash — null until tx sent */
  txHash?: string | null;
  chainId: number;
  playerAddress: string;
  /** keccak256(encodePacked(lineup, salt)) */
  commitHash: string;
  lineup: number[];
  /** AES-GCM ciphertext, base64-encoded */
  encryptedSalt: string;
  /** AES-GCM IV, base64-encoded */
  iv: string;
  status: MatchSecretStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** Payload sent to POST /api/secrets/create */
export type CreateSecretPayload = Omit<MatchSecret, 'id' | 'matchId' | 'txHash' | 'createdAt' | 'updatedAt'>;

/** Payload sent to POST /api/secrets/update */
export interface UpdateSecretPayload {
  id: string;
  matchId?: number;
  txHash?: string;
  status?: MatchSecretStatus;
}
