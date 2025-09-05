
-- 1) Tables

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  jt_game_id text not null unique,
  name text not null,
  slug text,
  sets_count integer,
  cards_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  jt_set_id text not null unique,
  game_id uuid not null references public.games(id) on delete cascade,
  code text,
  name text not null,
  release_date date,
  total_cards integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  jt_card_id text not null unique,
  set_id uuid not null references public.sets(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  number text,
  rarity text,
  image_url text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_prices (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  variant text,
  condition text,
  currency text not null default 'USD',
  market_price numeric(12,2),
  low_price numeric(12,2),
  high_price numeric(12,2),
  source text not null default 'JustTCG',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_card_price unique (card_id, variant, condition, source)
);

-- 2) Indexes

create index if not exists idx_sets_game_id on public.sets(game_id);
create index if not exists idx_cards_set_id on public.cards(set_id);
create index if not exists idx_cards_game_id on public.cards(game_id);
create index if not exists idx_card_prices_card_id on public.card_prices(card_id);

-- 3) RLS

alter table public.games enable row level security;
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_prices enable row level security;

-- Everyone can read
drop policy if exists "Games are viewable by everyone" on public.games;
create policy "Games are viewable by everyone"
  on public.games for select
  using (true);

drop policy if exists "Sets are viewable by everyone" on public.sets;
create policy "Sets are viewable by everyone"
  on public.sets for select
  using (true);

drop policy if exists "Cards are viewable by everyone" on public.cards;
create policy "Cards are viewable by everyone"
  on public.cards for select
  using (true);

drop policy if exists "Card prices are viewable by everyone" on public.card_prices;
create policy "Card prices are viewable by everyone"
  on public.card_prices for select
  using (true);

-- Only authenticated users can modify
drop policy if exists "Authenticated can insert games" on public.games;
create policy "Authenticated can insert games"
  on public.games for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update games" on public.games;
create policy "Authenticated can update games"
  on public.games for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can delete games" on public.games;
create policy "Authenticated can delete games"
  on public.games for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert sets" on public.sets;
create policy "Authenticated can insert sets"
  on public.sets for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update sets" on public.sets;
create policy "Authenticated can update sets"
  on public.sets for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can delete sets" on public.sets;
create policy "Authenticated can delete sets"
  on public.sets for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert cards" on public.cards;
create policy "Authenticated can insert cards"
  on public.cards for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update cards" on public.cards;
create policy "Authenticated can update cards"
  on public.cards for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can delete cards" on public.cards;
create policy "Authenticated can delete cards"
  on public.cards for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert card_prices" on public.card_prices;
create policy "Authenticated can insert card_prices"
  on public.card_prices for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update card_prices" on public.card_prices;
create policy "Authenticated can update card_prices"
  on public.card_prices for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can delete card_prices" on public.card_prices;
create policy "Authenticated can delete card_prices"
  on public.card_prices for delete
  using (auth.role() = 'authenticated');

-- 4) updated_at triggers

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
  before update on public.games
  for each row
  execute procedure public.update_updated_at_column();

drop trigger if exists sets_set_updated_at on public.sets;
create trigger sets_set_updated_at
  before update on public.sets
  for each row
  execute procedure public.update_updated_at_column();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row
  execute procedure public.update_updated_at_column();

drop trigger if exists card_prices_set_updated_at on public.card_prices;
create trigger card_prices_set_updated_at
  before update on public.card_prices
  for each row
  execute procedure public.update_updated_at_column();
