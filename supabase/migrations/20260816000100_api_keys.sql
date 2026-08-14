-- Per-organization ingest API keys, hashed at rest. The raw key
-- (tgk_live_...) is shown exactly once at issuance and never stored; the
-- ingest function resolves org identity by SHA-256 lookup, so a key can only
-- ever write into its own organization.

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  -- SHA-256 hex digest of the raw key.
  key_hash text not null unique,
  label text not null default 'default',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Service-role only: RLS enabled with no policies means clients can never
-- read or write keys.
alter table api_keys enable row level security;

create index api_keys_org_idx on api_keys (org_id);
