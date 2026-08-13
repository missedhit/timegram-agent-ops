-- Timegram Agent Ops — activity records: tasks, deviations, approvals.
--
-- Metadata-only: descriptions are business-language summaries of what an
-- agent did. There is deliberately no column for prompts, model output, or
-- customer content anywhere in this schema, and the ingest API rejects such
-- fields at the boundary.

create table tasks (
  org_id uuid not null,
  id text not null,
  agent_id text not null,
  timestamp timestamptz not null,
  description text not null,
  business_process text not null,
  cost_center text not null,
  outcome text not null check (outcome in ('completed', 'escalated', 'failed')),
  duration_sec integer not null check (duration_sec >= 0),
  cost_usd numeric not null check (cost_usd >= 0),
  units integer not null check (units >= 0),
  -- Secondary detail only — never a primary label in the UI.
  tokens integer not null check (tokens >= 0),
  primary key (org_id, id),
  foreign key (org_id, agent_id) references agents (org_id, id) on delete cascade
);

comment on table tasks is 'Task-level work log: what each agent did, when, at what cost. Business metadata only.';

create index tasks_org_timestamp_idx on tasks (org_id, timestamp);
create index tasks_org_agent_idx on tasks (org_id, agent_id);

create table deviations (
  org_id uuid not null,
  id text not null,
  agent_id text not null,
  policy_id text not null,
  timestamp timestamptz not null,
  description text not null,
  status text not null check (status in ('open', 'acknowledged', 'resolved')),
  resolved_at timestamptz,
  resolution_note text,
  primary key (org_id, id),
  foreign key (org_id, agent_id) references agents (org_id, id) on delete cascade,
  foreign key (org_id, policy_id) references policies (org_id, id) on delete cascade
);

comment on table deviations is 'Recorded departures from assigned SOP policies, with disposition.';

create index deviations_org_agent_idx on deviations (org_id, agent_id);

create table approvals (
  org_id uuid not null,
  id text not null,
  agent_id text not null,
  task_id text,
  timestamp timestamptz not null,
  approver text not null,
  approver_role text not null,
  description text not null,
  primary key (org_id, id),
  foreign key (org_id, agent_id) references agents (org_id, id) on delete cascade
);

comment on table approvals is 'Human sign-offs on escalated agent work. Feeds audit evidence packs.';

create index approvals_org_agent_idx on approvals (org_id, agent_id);
