import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client using the service-role key.
 * Bypasses RLS — only call from API route handlers, never expose to client.
 */
export function createServerSupabase() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
