-- ── duel_match_secrets ────────────────────────────────────────────────────────
-- Stores encrypted commit-reveal salts for Duel Cards matches.
-- The backend (service role) is the sole writer — no client writes.
-- RLS is enabled but all access goes through the Next.js API layer.

create table if not exists duel_match_secrets (
  id             uuid primary key default gen_random_uuid(),

  -- On-chain identifiers (nullable until tx is confirmed)
  match_id       bigint,
  tx_hash        text,
  chain_id       integer not null,

  -- Player identity
  player_address text    not null,  -- lowercase 0x...

  -- Commit-reveal fields
  commit_hash    text    not null unique,  -- keccak256 bytes32, hex
  lineup         jsonb   not null,        -- array of card ids, e.g. [1,5,3]

  -- Encrypted secret (the backend never sees the plaintext)
  encrypted_salt text    not null,  -- base64 AES-GCM ciphertext
  iv             text    not null,  -- base64 AES-GCM IV (12 bytes)

  -- Lifecycle status
  status         text    not null default 'draft'
                          check (status in ('draft','submitted','confirmed','revealed','resolved','expired')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Lookup by player (most common read pattern)
create index if not exists idx_dms_player_address
  on duel_match_secrets (player_address);

-- Lookup by on-chain match id
create index if not exists idx_dms_match_id
  on duel_match_secrets (match_id)
  where match_id is not null;

-- Lookup by tx hash (reconciliation after tx)
create index if not exists idx_dms_tx_hash
  on duel_match_secrets (tx_hash)
  where tx_hash is not null;

-- Pending secrets per player (reveal queue)
create index if not exists idx_dms_player_status
  on duel_match_secrets (player_address, status);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dms_updated_at on duel_match_secrets;
create trigger trg_dms_updated_at
  before update on duel_match_secrets
  for each row execute function set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- All access goes through the Next.js backend using the SERVICE ROLE key,
-- which bypasses RLS. The policies below are a defence-in-depth fallback
-- in case the anon key is ever used directly.

alter table duel_match_secrets enable row level security;

-- Service role bypasses RLS automatically — no policy needed for it.
-- Deny all direct access via the anon key.
create policy "deny_anon_select" on duel_match_secrets
  for select using (false);

create policy "deny_anon_insert" on duel_match_secrets
  for insert with check (false);

create policy "deny_anon_update" on duel_match_secrets
  for update using (false);

create policy "deny_anon_delete" on duel_match_secrets
  for delete using (false);
