-- Row-level security scaffold.
--
-- RLS is enabled on EVERY table from the start. The tmp_anon_read_* policies
-- below are TEMPORARY: they let the app read data before auth ships (milestone
-- B4), and the auth milestone (B5) drops every policy named tmp_* and replaces
-- them with org-membership checks. The exposure window contains only the
-- synthetic Northbridge Mutual demo dataset.
--
-- Writes have no client policies at any point: all writes go through the
-- service role (seed script, ingest function), which bypasses RLS by design.

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table policies enable row level security;
alter table agent_policies enable row level security;
alter table tasks enable row level security;
alter table deviations enable row level security;
alter table approvals enable row level security;

create policy tmp_anon_read_orgs on orgs for select to anon, authenticated using (true);
create policy tmp_anon_read_agents on agents for select to anon, authenticated using (true);
create policy tmp_anon_read_agent_versions on agent_versions for select to anon, authenticated using (true);
create policy tmp_anon_read_policies on policies for select to anon, authenticated using (true);
create policy tmp_anon_read_agent_policies on agent_policies for select to anon, authenticated using (true);
create policy tmp_anon_read_tasks on tasks for select to anon, authenticated using (true);
create policy tmp_anon_read_deviations on deviations for select to anon, authenticated using (true);
create policy tmp_anon_read_approvals on approvals for select to anon, authenticated using (true);

-- org_members deliberately gets NO tmp read policy — membership rows are
-- never client-readable until real auth lands.
