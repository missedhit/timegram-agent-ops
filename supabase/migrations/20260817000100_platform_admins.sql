-- Platform admins — who may operate the /admin dashboard (org onboarding,
-- key issuance, deletion). Distinct from org_members.role: that is org-scoped
-- ("admin of Acme"); this is platform-scoped ("operates the PoC environment").
--
-- The admin edge function is the enforcement point: it resolves the caller
-- from their session JWT and requires a row here (service-role lookup).
-- The single client-facing policy below only lets a signed-in user see their
-- OWN row, so the app can decide whether to show the Admin nav item. Writes
-- have no client policies: rows are inserted by migration or service role.

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- (select auth.uid()) — the subselect form is cached per statement rather
-- than evaluated per row (the standard RLS performance pattern).
create policy self_read_platform_admins on platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Bootstrap the founder. Idempotent; a no-op if the auth user doesn't exist
-- yet (then insert via service role after their first sign-in).
insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'iqbal@timegram.io'
on conflict do nothing;
