-- Defense in depth for the new write paths (agent registration and deviation
-- reporting): the same length bounds the contracts enforce, guaranteed at the
-- schema so no caller — even via service role — can store transcript-length
-- text in fields that are business labels.

alter table deviations
  add constraint deviations_description_len check (char_length(description) <= 300);

alter table agents
  add constraint agents_name_len check (char_length(name) <= 120),
  add constraint agents_purpose_len check (char_length(purpose) <= 300),
  add constraint agents_owner_name_len check (char_length(owner_name) <= 120),
  add constraint agents_owner_department_len check (char_length(owner_department) <= 80),
  add constraint agents_department_len check (char_length(department) <= 80),
  add constraint agents_model_len check (char_length(model) <= 80),
  add constraint agents_model_provider_len check (char_length(model_provider) <= 80),
  add constraint agents_unit_label_len check (char_length(unit_label) <= 40);
