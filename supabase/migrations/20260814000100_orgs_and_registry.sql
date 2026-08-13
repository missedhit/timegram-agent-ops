-- Timegram Agent Ops — organizations and the agent registry.
--
-- Mirrors src/domain/types.ts. Org-scoped from day one: every row carries
-- org_id and every primary key is (org_id, id), so multi-tenancy is a data
-- fact rather than a retrofit.
--
-- Metadata-only by construction: no column in this schema can hold prompt or
-- model-output content. Tasks carry business descriptions of activity only.

create table orgs (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table orgs is 'Tenant organizations. The demo dataset lives under a single fixed org.';

create table org_members (
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table agents (
  org_id uuid not null references orgs (id) on delete cascade,
  id text not null,
  name text not null,
  purpose text not null,
  owner_name text not null,
  owner_department text not null,
  department text not null check (department in ('Finance', 'Support', 'Sales Ops', 'Claims', 'IT')),
  status text not null check (status in ('active', 'paused', 'retired')),
  model text not null,
  model_provider text not null check (model_provider in ('Anthropic', 'OpenAI', 'Google', 'On-prem')),
  tools text[] not null default '{}',
  data_domains text[] not null default '{}',
  permissions text[] not null default '{}',
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  version text not null,
  deployed_at date not null,
  paused_at date,
  retired_at date,
  monthly_budget_usd numeric not null,
  unit_label text not null,
  human_baseline_usd_per_unit numeric not null,
  -- Curated display order (the registry is not alphabetical).
  sort_order integer not null default 0,
  primary key (org_id, id)
);

comment on table agents is 'The agent registry: ownership, access, standing, and budget for every deployed AI agent.';

-- Agent.versionHistory, normalized. The agents.version column always matches
-- the newest row here; the seed loader keeps them in sync.
create table agent_versions (
  org_id uuid not null,
  agent_id text not null,
  version text not null,
  date date not null,
  note text not null,
  sort_order integer not null default 0,
  primary key (org_id, agent_id, version),
  foreign key (org_id, agent_id) references agents (org_id, id) on delete cascade
);

create table policies (
  org_id uuid not null references orgs (id) on delete cascade,
  id text not null,
  name text not null,
  rule text not null,
  enforcement text not null check (enforcement in ('block', 'log-only')),
  created_at date not null,
  sort_order integer not null default 0,
  primary key (org_id, id)
);

comment on table policies is 'SOP policies in plain business English, with their enforcement mode.';

-- Replaces the redundant Agent.policyIds / Policy.agentIds inverse arrays.
create table agent_policies (
  org_id uuid not null,
  agent_id text not null,
  policy_id text not null,
  sort_order integer not null default 0,
  primary key (org_id, agent_id, policy_id),
  foreign key (org_id, agent_id) references agents (org_id, id) on delete cascade,
  foreign key (org_id, policy_id) references policies (org_id, id) on delete cascade
);
