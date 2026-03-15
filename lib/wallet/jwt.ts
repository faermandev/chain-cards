import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'cc-auth-token';
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'CHANGE_ME_in_production');
const ISSUER = 'chain-cards';
const EXPIRY = '24h';

export interface SessionPayload {
  address: string;
  [key: string]: unknown;
}

// ── Sign ──────────────────────────────────────────────────────────────────────

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

// ── Verify ────────────────────────────────────────────────────────────────────

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    return { address: payload.address as string };
  } catch {
    return null;
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Extract and verify the session cookie from an incoming request. */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Build Set-Cookie header value for a new session. */
export async function buildSetCookie(payload: SessionPayload): Promise<string> {
  const token = await signSession(payload);
  const isProduction = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${60 * 60 * 24}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

/** Build a cookie header that clears the session. */
export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}
