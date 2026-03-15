import { NextResponse } from 'next/server';
import { buildClearCookie } from '@/lib/wallet/jwt';

export async function POST() {
  return NextResponse.json(
    { ok: true },
    { headers: { 'Set-Cookie': buildClearCookie() } }
  );
}
