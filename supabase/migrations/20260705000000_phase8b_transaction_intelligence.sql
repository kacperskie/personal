create table if not exists public.merchant_rules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_pattern text not null,
  normalised_merchant_name text not null,
  merchant_group text,
  category text not null,
  subcategory text,
  priority integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_enrichments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null references public.transactions(id) on delete cascade,
  normalised_merchant_name text not null,
  merchant_group text,
  category text not null,
  subcategory text,
  confidence_score numeric not null default 0,
  enrichment_source text not null,
  user_reviewed boolean not null default false,
  excluded_from_spending boolean not null default false,
  internal_transfer boolean not null default false,
  bill_candidate boolean not null default false,
  subscription_candidate boolean not null default false,
  recurring_candidate boolean not null default false,
  review_status text not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, transaction_id)
);

create table if not exists public.recurring_payment_candidates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  amount_estimate numeric not null,
  frequency text not null,
  next_expected_date date not null,
  confidence numeric not null default 0,
  linked_account_id text not null references public.accounts(id) on delete cascade,
  latest_transaction_date date not null,
  transaction_ids text[] not null default '{}',
  candidate_type text not null default 'unknown',
  status text not null default 'needs_review',
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.detected_bills (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant text not null,
  amount_estimate numeric not null,
  frequency text not null,
  next_due_date date not null,
  payment_account_id text references public.accounts(id) on delete set null,
  category text not null,
  confidence numeric not null default 0,
  source text not null,
  status text not null default 'needs_review',
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.detected_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant text not null,
  amount_estimate numeric not null,
  frequency text not null,
  next_expected_date date not null,
  payment_account_id text references public.accounts(id) on delete set null,
  category text not null,
  confidence numeric not null default 0,
  status text not null default 'needs_review',
  reviewed boolean not null default false,
  price_change_detected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spending_anomalies (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  description text not null,
  severity text not null default 'warning',
  transaction_ids text[] not null default '{}',
  merchant text,
  category text,
  amount numeric,
  expected_amount numeric,
  detected_at timestamptz not null default now(),
  status text not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cashflow_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null,
  amount numeric not null,
  currency text not null default 'GBP',
  direction text not null,
  source text not null,
  account_id text references public.accounts(id) on delete set null,
  include_in_cashflow boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_rules enable row level security;
alter table public.transaction_enrichments enable row level security;
alter table public.recurring_payment_candidates enable row level security;
alter table public.detected_bills enable row level security;
alter table public.detected_subscriptions enable row level security;
alter table public.spending_anomalies enable row level security;
alter table public.cashflow_events enable row level security;

do $$
declare
  table_name text;
  tables text[] := array[
    'merchant_rules',
    'transaction_enrichments',
    'recurring_payment_candidates',
    'detected_bills',
    'detected_subscriptions',
    'spending_anomalies',
    'cashflow_events'
  ];
begin
  foreach table_name in array tables loop
    execute format(
      'drop policy if exists "%1$s_select_own_rows" on public.%1$I',
      table_name
    );
    execute format(
      'create policy "%1$s_select_own_rows" on public.%1$I for select to authenticated using (auth.uid() = user_id)',
      table_name
    );

    execute format(
      'drop policy if exists "%1$s_insert_own_rows" on public.%1$I',
      table_name
    );
    execute format(
      'create policy "%1$s_insert_own_rows" on public.%1$I for insert to authenticated with check (auth.uid() = user_id)',
      table_name
    );

    execute format(
      'drop policy if exists "%1$s_update_own_rows" on public.%1$I',
      table_name
    );
    execute format(
      'create policy "%1$s_update_own_rows" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );

    execute format(
      'drop policy if exists "%1$s_delete_own_rows" on public.%1$I',
      table_name
    );
    execute format(
      'create policy "%1$s_delete_own_rows" on public.%1$I for delete to authenticated using (auth.uid() = user_id)',
      table_name
    );
  end loop;
end $$;
