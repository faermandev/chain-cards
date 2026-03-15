import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/wallet/jwt';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /api/secrets/pending
 *
 * Returns all secrets with status in (draft, submitted, confirmed) for the
 * authenticated player — i.e. secrets that still need reveal.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerSupabase();
  const { data, error } = await db
    .from('duel_match_secrets')
    .select('*')
    .eq('player_address', session.address.toLowerCase())
    .in('status', ['draft', 'submitted', 'confirmed'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase fetch error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(toPublic));
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
