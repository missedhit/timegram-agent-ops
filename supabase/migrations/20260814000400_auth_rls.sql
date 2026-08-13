-- Real row-level security: drop the temporary anon-read scaffold and scope
-- every read to org membership. Clients get NO write policies at all — every
-- write goes through the service role (seed script, ingest function).

drop policy tmp_anon_read_orgs on orgs;
drop policy tmp_anon_read_agents on agents;
drop policy tmp_anon_read_agent_versions on agent_versions;
drop policy tmp_anon_read_policies on policies;
drop policy tmp_anon_read_agent_policies on agent_policies;
drop policy tmp_anon_read_tasks on tasks;
drop policy tmp_anon_read_deviations on deviations;
drop policy tmp_anon_read_approvals on approvals;

-- (select auth.uid()) — the subselect form is cached per statement rather
-- than evaluated per row (the standard RLS performance pattern).

create policy member_read_orgs on orgs for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = orgs.id and m.user_id = (select auth.uid())
  ));

create policy member_read_own_membership on org_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy member_read_agents on agents for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = agents.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_agent_versions on agent_versions for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = agent_versions.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_policies on policies for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = policies.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_agent_policies on agent_policies for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = agent_policies.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_tasks on tasks for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = tasks.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_deviations on deviations for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = deviations.org_id and m.user_id = (select auth.uid())
  ));

create policy member_read_approvals on approvals for select to authenticated
  using (exists (
    select 1 from org_members m
    where m.org_id = approvals.org_id and m.user_id = (select auth.uid())
  ));
