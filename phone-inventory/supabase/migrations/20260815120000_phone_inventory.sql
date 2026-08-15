-- Phone Inventory — Supabase schema
-- Paste into Supabase SQL Editor (Dashboard → SQL → New query)

-- Phones: each physical unit is one row (kept after sale with status='sold')
create table if not exists public.phones (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  model_name text not null,
  storage text not null,
  imei text not null,
  battery_percent integer not null check (battery_percent >= 0 and battery_percent <= 100),
  condition text not null,
  note text,
  purchase_price numeric(12, 2) not null check (purchase_price >= 0),
  listed_value numeric(12, 2) not null check (listed_value >= 0),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'sold', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phones_imei_idx on public.phones (imei);
create index if not exists phones_model_id_idx on public.phones (model_id);
create index if not exists phones_model_name_idx on public.phones (model_name);
create index if not exists phones_status_idx on public.phones (status);

-- Sales: one row per completed sale (sold_at drives monthly profit)
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  phone_id uuid not null references public.phones (id) on delete restrict,
  model_id text not null,
  model_name text not null,
  storage text,
  imei text,
  buyer_name text not null,
  purchase_price numeric(12, 2) not null,
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  profit numeric(12, 2) not null,
  deposit_to text not null default 'cash' check (deposit_to in ('cash', 'bank')),
  sold_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists sales_phone_id_idx on public.sales (phone_id);
create index if not exists sales_model_id_idx on public.sales (model_id);

-- Singleton finance row (cash / bank)
create table if not exists public.finance (
  id integer primary key default 1 check (id = 1),
  cash numeric(12, 2) not null default 0,
  bank numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.finance (id, cash, bank)
values (1, 0, 0)
on conflict (id) do nothing;

-- Operation history (purchases, sales, edits, finance changes)
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  date timestamptz not null default now(),
  model_name text not null,
  purchase_price numeric(12, 2),
  sale_price numeric(12, 2),
  profit numeric(12, 2),
  storage text,
  imei text,
  buyer_name text,
  note text,
  phone_id uuid references public.phones (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists history_date_idx on public.history (date desc);
create index if not exists history_type_idx on public.history (type);

-- Open read/write for the publishable anon key (single-user inventory app).
-- Tighten with auth/RLS policies later if you add user accounts.
alter table public.phones enable row level security;
alter table public.sales enable row level security;
alter table public.finance enable row level security;
alter table public.history enable row level security;

drop policy if exists "phones_all_anon" on public.phones;
create policy "phones_all_anon" on public.phones
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "sales_all_anon" on public.sales;
create policy "sales_all_anon" on public.sales
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "finance_all_anon" on public.finance;
create policy "finance_all_anon" on public.finance
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "history_all_anon" on public.history;
create policy "history_all_anon" on public.history
  for all to anon, authenticated using (true) with check (true);
