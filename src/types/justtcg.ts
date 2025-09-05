export type Variant = {
  id: string;
  condition: string;
  printing: string;
  language?: string | null;
  price?: number | null;
  lastUpdated?: string | null;
  priceChange24hr?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  priceChange90d?: number | null;
  avgPrice?: number | null;
  priceHistory?: Array<{ date: string; price: number }> | null;
};

export type Card = {
  id: string;
  name: string;
  game: string;
  set: string;
  number?: string | null;
  tcgplayerId?: string | null;
  rarity?: string | null;
  details?: string | null;
  variants: Variant[];
};

export type Meta = {
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
};

export type Envelope<T> = {
  data: T;
  meta?: Meta;
  _metadata?: Record<string, any>;
};

export type Game = {
  id: string;
  name: string;
  slug: string;
  sets_count?: number;
  last_synced_at?: string;
};

export type Set = {
  id: string;
  name: string;
  game: string;
  game_id: string;
  cards_count?: number;
  sync_status?: string;
  last_synced_at?: string;
};

export type ListParams = {
  gameId: string;
  setId?: string;
  pageSize?: number;
  orderBy?: "price" | "24h" | "7d" | "30d";
  order?: "asc" | "desc";
};

export type BatchItem = {
  tcgplayerId: string;
  condition?: string;
  printing?: string;
};