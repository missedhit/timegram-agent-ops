-- Defense in depth for the metadata-only guarantee: the ingest validator caps
-- every free-text field, and the schema enforces the same bounds so no future
-- caller (even via service role) can store transcript-length text in fields
-- that are supposed to be business labels.

alter table tasks
  add constraint tasks_description_len check (char_length(description) <= 300),
  add constraint tasks_business_process_len check (char_length(business_process) <= 120),
  add constraint tasks_cost_center_len check (char_length(cost_center) <= 120);
