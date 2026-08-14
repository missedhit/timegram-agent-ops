-- Prospect orgs bring their own org charts and model stacks: departments and
-- model providers become free-form labels. (Length caps arrive with the
-- registration contract's hardening migration in M2; risk_level and status
-- remain closed enums the UI switches on.)

alter table agents drop constraint agents_department_check;
alter table agents drop constraint agents_model_provider_check;
