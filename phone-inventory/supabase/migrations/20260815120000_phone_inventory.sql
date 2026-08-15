-- =============================================================================
-- Phone Inventory — COMPLETE Supabase schema (paste once into SQL Editor)
-- Source of truth: phone-inventory/src/storage/supabaseRepository.ts
--                 + phone-inventory/src/lib/supabase.ts
--                 + phone-inventory/src/domain/types.ts
--
-- Tables: phones, sales, finance, history
-- =============================================================================

-- ---------------------------------------------------------------------------
-- phones — one row per physical unit (kept after sale with status = 'sold')
-- App fields: id, modelId→model_id, modelName→model_name, storage, imei,
--   batteryPercent→battery_percent, condition, note, purchasePrice→purchase_price,
--   listedValue→listed_value, status, createdAt→created_at, updatedAt→updated_at
-- ---------------------------------------------------------------------------
create table if not exists public.phones (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  model_name text not null,
  storage text not null,
  imei text not null,
  battery_percent integer not null
    check (battery_percent >= 0 and battery_percent <= 100),
  condition text not null
    check (condition in (
      'idealny',
      'bardzo_dobry',
      'dobry',
      'uzywany',
      'uszkodzony'
    )),
  note text,
  purchase_price numeric(12, 2) not null
    check (purchase_price >= 0),
  listed_value numeric(12, 2) not null
    check (listed_value >= 0),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'sold', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phones_imei_idx on public.phones (imei);
create index if not exists phones_model_id_idx on public.phones (model_id);
create index if not exists phones_model_name_idx on public.phones (model_name);
create index if not exists phones_status_idx on public.phones (status);

-- ---------------------------------------------------------------------------
-- sales — one row per completed sale (sold_at drives monthly profit)
-- App fields: id, phoneId→phone_id, modelId→model_id, modelName→model_name,
--   storage, imei, buyerName→buyer_name, purchasePrice→purchase_price,
--   salePrice→sale_price, profit, depositTo→deposit_to, soldAt→sold_at
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  phone_id uuid not null
    references public.phones (id) on delete restrict,
  model_id text not null,
  model_name text not null,
  storage text,
  imei text,
  buyer_name text not null,
  purchase_price numeric(12, 2) not null
    check (purchase_price >= 0),
  sale_price numeric(12, 2) not null
    check (sale_price >= 0),
  profit numeric(12, 2) not null,
  deposit_to text not null default 'cash'
    check (deposit_to in ('cash', 'bank')),
  sold_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_sold_at_idx on public.sales (sold_at);
create index if not exists sales_phone_id_idx on public.sales (phone_id);
create index if not exists sales_model_id_idx on public.sales (model_id);
create index if not exists sales_buyer_name_idx on public.sales (buyer_name);

-- ---------------------------------------------------------------------------
-- finance — singleton cash / bank balances (app: finance.cash, finance.bank)
-- ---------------------------------------------------------------------------
create table if not exists public.finance (
  id integer primary key default 1
    check (id = 1),
  cash numeric(12, 2) not null default 0,
  bank numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.finance (id, cash, bank)
values (1, 0, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- history — operation log (purchase | sale | remove | update | finance)
-- App fields: id, type, date, modelName→model_name, purchasePrice, salePrice,
--   profit, storage, imei, buyerName→buyer_name, note, phoneId→phone_id
-- ---------------------------------------------------------------------------
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  type text not null
    check (type in ('purchase', 'sale', 'remove', 'update', 'finance')),
  date timestamptz not null default now(),
  model_name text not null,
  purchase_price numeric(12, 2),
  sale_price numeric(12, 2),
  profit numeric(12, 2),
  storage text,
  imei text,
  buyer_name text,
  note text,
  phone_id uuid
    references public.phones (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists history_date_idx on public.history (date desc);
create index if not exists history_type_idx on public.history (type);
create index if not exists history_phone_id_idx on public.history (phone_id);

-- =============================================================================
-- Privileges + Row Level Security
--
-- Sensitive data: IMEI, buyer_name, purchase/sale prices.
-- - anon (bare publishable key, no JWT session): NO table access
-- - authenticated (signed-in session, incl. Anonymous Sign-In): full CRUD
-- - service_role (dashboard / server): bypasses RLS
--
-- App requirement: enable Authentication → Providers → Anonymous Sign-Ins
-- (client signs in silently; no UI login). All authenticated devices share
-- the same inventory rows (shared household store).
-- =============================================================================

revoke all on table public.phones from public;
revoke all on table public.phones from anon;
revoke all on table public.sales from public;
revoke all on table public.sales from anon;
revoke all on table public.finance from public;
revoke all on table public.finance from anon;
revoke all on table public.history from public;
revoke all on table public.history from anon;

grant select, insert, update, delete on table public.phones to authenticated;
grant select, insert, update, delete on table public.sales to authenticated;
grant select, insert, update, delete on table public.finance to authenticated;
grant select, insert, update, delete on table public.history to authenticated;

alter table public.phones enable row level security;
alter table public.sales enable row level security;
alter table public.finance enable row level security;
alter table public.history enable row level security;

-- Drop legacy wide-open policies if a previous migration applied them
drop policy if exists "phones_all_anon" on public.phones;
drop policy if exists "sales_all_anon" on public.sales;
drop policy if exists "finance_all_anon" on public.finance;
drop policy if exists "history_all_anon" on public.history;

drop policy if exists "phones_authenticated_all" on public.phones;
drop policy if exists "sales_authenticated_all" on public.sales;
drop policy if exists "finance_authenticated_all" on public.finance;
drop policy if exists "history_authenticated_all" on public.history;

create policy "phones_authenticated_all"
  on public.phones
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "sales_authenticated_all"
  on public.sales
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "finance_authenticated_all"
  on public.finance
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "history_authenticated_all"
  on public.history
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
