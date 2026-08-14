-- Bootstrap fix: the founder's live auth account is the OWNER OF THE
-- FOUNDATION ORG, not necessarily a hard-coded address (the first bootstrap
-- targeted iqbal@timegram.io, which has no auth user yet, and inserted zero
-- rows). Grant platform admin to every owner of "Northbridge Mutual" — the
-- protected foundation org only the founder can own — and keep the email
-- clause for when that account is created later. Idempotent.

insert into platform_admins (user_id)
select m.user_id
from org_members m
join orgs o on o.id = m.org_id
where o.name = 'Northbridge Mutual' and m.role = 'owner'
on conflict do nothing;

insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'iqbal@timegram.io'
on conflict do nothing;
