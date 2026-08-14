-- Each organization reports in its own business timezone. Existing orgs keep
-- US Eastern (the behavior to date), so the seeded demo org is unchanged.

alter table orgs
  add column timezone text not null default 'America/New_York';
