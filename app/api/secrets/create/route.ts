import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/wallet/jwt';
import { createServerSupabase } from '@/lib/supabase/server';
import type { CreateSecretPayload } from '@/lib/commit/types';

/**
 * POST /api/secrets/create
 * Body: CreateSecretPayload
 *
 * Validates session + payload, then inserts a row in duel_match_secrets.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateSecretPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  const errs = validate(body, session.address);
  if (errs.length > 0) {
    return NextResponse.json({ error: errs.join(', ') }, { status: 422 });
  }

  // ── Persist ─────────────────────────────────────────────────────────────────
  const db = createServerSupabase();
  const { data, error } = await db
    .from('duel_match_secrets')
    .insert({
      chain_id: body.chainId,
      player_address: body.playerAddress.toLowerCase(),
      commit_hash: body.commitHash,
      lineup: body.lineup,
      encrypted_salt: body.encryptedSalt,
      iv: body.iv,
      status: body.status ?? 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validate(body: CreateSecretPayload, sessionAddress: string): string[] {
  const errors: string[] = [];
  if (!body.playerAddress || typeof body.playerAddress !== 'string') {
    errors.push('playerAddress required');
  } else if (body.playerAddress.toLowerCase() !== sessionAddress.toLowerCase()) {
    errors.push('playerAddress does not match session');
  }
  if (!body.chainId || typeof body.chainId !== 'number') errors.push('chainId required');
  if (!body.commitHash || !/^0x[0-9a-fA-F]{64}$/.test(body.commitHash)) {
    errors.push('commitHash must be a 32-byte hex string');
  }
  if (!Array.isArray(body.lineup) || body.lineup.length === 0) errors.push('lineup must be a non-empty array');
  if (!body.encryptedSalt || typeof body.encryptedSalt !== 'string') errors.push('encryptedSalt required');
  if (!body.iv || typeof body.iv !== 'string') errors.push('iv required');
  return errors;
}
