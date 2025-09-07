-- Ensure tcgcsv_groups matches expected CSV columns
-- Create table if it does not exist
create table if not exists public.tcgcsv_groups (
  group_id        bigint primary key,
  category_id     integer not null,
  name            text not null,
  abbreviation    text,
  is_supplemental boolean,
  published_on    timestamptz,
  modified_on     timestamptz,
  updated_at      timestamptz default now()
);

-- Add missing columns if they don't exist
alter table public.tcgcsv_groups
  add column if not exists category_id integer,
  add column if not exists name text,
  add column if not exists abbreviation text,
  add column if not exists is_supplemental boolean,
  add column if not exists published_on timestamptz,
  add column if not exists modified_on timestamptz,
  add column if not exists updated_at timestamptz;

-- Rename legacy column if present
do $$ begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tcgcsv_groups' and column_name='groupid'
  ) then
    execute 'alter table public.tcgcsv_groups rename column groupid to group_id';
  end if;
end $$;

-- Ensure primary key on group_id
alter table public.tcgcsv_groups drop constraint if exists tcgcsv_groups_pkey;
alter table public.tcgcsv_groups add primary key (group_id);
