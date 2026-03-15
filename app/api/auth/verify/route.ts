import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { buildSetCookie } from '@/lib/wallet/jwt';
import { buildNonce } from '../nonce/route';

/**
 * POST /api/auth/verify
 * Body: { address: string, signature: string }
 *
 * Verifies that `signature` is a valid signature of the current (or previous)
 * 5-minute window nonce for `address`, then sets an HTTP-only session cookie.
 */
export async function POST(req: NextRequest) {
  let body: { address?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, signature } = body;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!signature || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Check current window and the immediately previous one (handles clock skew)
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(now / 300) * 300;
  const prevWindow = currentWindow - 300;

  const validWindows = [currentWindow, prevWindow];
  let verified = false;

  for (const windowTs of validWindows) {
    const nonce = buildNonce(address, windowTs);
    try {
      const ok = await verifyMessage({
        address: address as `0x${string}`,
        message: nonce,
        signature: signature as `0x${string}`,
      });
      if (ok) { verified = true; break; }
    } catch {
      // try next window
    }
  }

  if (!verified) {
    return NextResponse.json({ error: 'Signature invalid or expired' }, { status: 401 });
  }

  const cookie = await buildSetCookie({ address: address.toLowerCase() });
  return NextResponse.json(
    { ok: true },
    { headers: { 'Set-Cookie': cookie } }
  );
}
