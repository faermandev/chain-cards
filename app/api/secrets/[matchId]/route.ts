import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/wallet/jwt';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /api/secrets/[matchId]
 *
 * Returns the encrypted secret for a given matchId.
 * Only the owner (playerAddress matching session) receives data.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { matchId } = await params;
  const matchIdNum = parseInt(matchId, 10);
  if (isNaN(matchIdNum)) {
    return NextResponse.json({ error: 'Invalid matchId' }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from('duel_match_secrets')
    .select('*')
    .eq('match_id', matchIdNum)
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
