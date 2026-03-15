import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/wallet/jwt';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * POST /api/secrets/by-tx
 * Body: { txHash: string }
 *
 * Returns the secret associated with a transaction hash.
 * Only the owner receives data.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.txHash || typeof body.txHash !== 'string') {
    return NextResponse.json({ error: 'txHash required' }, { status: 422 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from('duel_match_secrets')
    .select('*')
    .eq('tx_hash', body.txHash.toLowerCase())
    .eq('player_address', session.address.toLowerCase())
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(toPublic(data));
}

function toPublic(row: Record<string, unknown>) {
  return {
    id: row.id,
    matchId: row.match_id,
    txHash: row.tx_hash,
    chainId: row.chain_id,
    playerAddress: row.player_address,
    commitHash: row.commit_hash,
    lineup: row.lineup,
    encryptedSalt: row.encrypted_salt,
    iv: row.iv,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
