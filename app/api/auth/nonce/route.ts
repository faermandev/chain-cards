import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/nonce?address=0x...
 *
 * Returns a message for the client to sign.
 * The message embeds the address + a 5-minute timestamp window so the
 * backend can validate freshness without server-side nonce storage.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // Round timestamp down to 5-minute window so replays expire quickly
  const windowTs = Math.floor(Date.now() / 1000 / 300) * 300;

  const nonce = buildNonce(address, windowTs);
  return NextResponse.json({ nonce });
}

export function buildNonce(address: string, windowTs: number): string {
  return `Sign to authenticate with Duel Cards.\n\nAddress: ${address.toLowerCase()}\nTimestamp: ${windowTs}`;
}
