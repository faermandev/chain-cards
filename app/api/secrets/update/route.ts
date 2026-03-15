import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/wallet/jwt';
import { createServerSupabase } from '@/lib/supabase/server';
import type { UpdateSecretPayload } from '@/lib/commit/types';

/**
 * POST /api/secrets/update
 * Body: UpdateSecretPayload
 *
 * Only the record owner can update matchId, txHash, and status.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: UpdateSecretPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 422 });
  }

  const db = createServerSupabase();

  // Verify ownership
  const { data: existing, error: fetchErr } = await db
    .from('duel_match_secrets')
    .select('player_address')
    .eq('id', body.id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.player_address.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build patch — only allow these three fields
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.matchId !== undefined) patch.match_id = body.matchId;
  if (body.txHash !== undefined) patch.tx_hash = body.txHash;
  if (body.status !== undefined) patch.status = body.status;

  const { error } = await db.from('duel_match_secrets').update(patch).eq('id', body.id);

  if (error) {
    console.error('Supabase update error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
