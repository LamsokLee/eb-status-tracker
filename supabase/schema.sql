-- EB2/EB3 status tracker table
create table if not exists eb_entries (
  id text primary key,
  category text not null,
  pd date not null,
  law_firm text not null default '',
  status text not null default 'Case Not Opened',
  case_open_date date,
  case_filed_date date,
  decision_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No auth in this app by design: anyone can read/insert/update.
alter table eb_entries enable row level security;

drop policy if exists "public read" on eb_entries;
create policy "public read" on eb_entries for select using (true);

drop policy if exists "public insert" on eb_entries;
create policy "public insert" on eb_entries for insert with check (true);

drop policy if exists "public update" on eb_entries;
create policy "public update" on eb_entries for update using (true);
