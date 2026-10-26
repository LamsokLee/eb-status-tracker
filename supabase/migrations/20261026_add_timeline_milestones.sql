-- Additional optional I-485 timeline milestones.
-- Idempotent and additive: safe to run on an existing eb_entries table.
alter table eb_entries add column if not exists receipt_date date;
alter table eb_entries add column if not exists biometrics_date date;
alter table eb_entries add column if not exists rfe_date date;
alter table eb_entries add column if not exists ead_approved_date date;
alter table eb_entries add column if not exists ap_approved_date date;
