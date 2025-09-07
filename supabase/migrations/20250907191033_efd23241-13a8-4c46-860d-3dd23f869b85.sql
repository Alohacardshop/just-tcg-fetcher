-- Create table for TCGCSV categories
create table if not exists public.tcgcsv_categories (
  id uuid primary key default gen_random_uuid(),
  tcgcsv_category_id integer not null unique,
  name text not null,
  display_name text,
  modified_on timestamptz,
  category_group_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS and basic policies
alter table public.tcgcsv_categories enable row level security;

create policy if not exists "Categories are viewable by everyone"
  on public.tcgcsv_categories
  for select
  using (true);

-- Trigger to update updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger trg_tcgcsv_categories_updated_at
before update on public.tcgcsv_categories
for each row
execute function public.update_updated_at_column();

-- Create sync_logs table for operation logging
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  operation_type text not null,
  status text not null,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for efficient querying
create index if not exists idx_sync_logs_operation_id on public.sync_logs (operation_id);
create index if not exists idx_sync_logs_created_at on public.sync_logs (created_at);

-- Enable RLS and allow read access to everyone
alter table public.sync_logs enable row level security;

create policy if not exists "Sync logs are viewable by everyone"
  on public.sync_logs
  for select
  using (true);
