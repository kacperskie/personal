create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  locale text not null default 'en-GB',
  currency text not null default 'GBP',
  payday_day_of_month integer not null default 25,
  minimum_buffer numeric not null default 350,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_connections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  institution_name text not null,
  institution_id text not null,
  status text not null,
  consent_status text not null,
  consent_started_at timestamptz,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id text references public.bank_connections(id) on delete set null,
  provider_account_id text,
  institution_name text not null,
  institution_id text not null,
  name text not null,
  official_name text not null,
  type text not null,
  subtype text not null,
  balance numeric not null default 0,
  available_balance numeric,
  credit_limit numeric,
  currency text not null default 'GBP',
  mask text,
  purpose text not null default 'other',
  account_role text not null default 'other',
  include_in_cashflow boolean not null default true,
  include_in_net_worth boolean not null default true,
  include_in_safe_to_spend boolean not null default false,
  is_spending_account boolean not null default false,
  is_bills_account boolean not null default false,
  is_savings_account boolean not null default false,
  linked_goal_ids text[] not null default '{}',
  sync_status text not null default 'not_connected',
  last_synced_at timestamptz,
  consent_expires_at timestamptz,
  notes text,
  provider text not null default 'manual',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id text not null references public.bank_connections(id) on delete cascade,
  provider_account_id text not null,
  institution_name text not null,
  institution_id text not null,
  name text not null,
  official_name text not null,
  type text not null,
  subtype text not null,
  balance numeric not null default 0,
  available_balance numeric,
  credit_limit numeric,
  currency text not null default 'GBP',
  mask text,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_connection_id, provider_account_id)
);

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id text references public.categories(id) on delete set null,
  kind text not null,
  budget_type text not null,
  include_in_budget boolean not null default true,
  status text not null default 'active'
);

create table if not exists public.budget_periods (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open'
);

create table if not exists public.budgets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null references public.categories(id) on delete cascade,
  period_id text not null references public.budget_periods(id) on delete cascade,
  amount numeric not null,
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  category_id text not null references public.categories(id) on delete restrict,
  provider_connection_id text references public.bank_connections(id) on delete set null,
  provider_transaction_id text,
  date date not null,
  merchant text not null default '',
  description text not null default '',
  amount numeric not null,
  currency text not null default 'GBP',
  kind text not null,
  status text not null default 'needs_review',
  flags text[] not null default '{}',
  pending boolean not null default false,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bills (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null,
  currency text not null default 'GBP',
  due_date date not null,
  recurrence jsonb not null default '{"frequency":"monthly","interval":1}',
  category_id text not null references public.categories(id) on delete restrict,
  account_id text references public.accounts(id) on delete set null,
  essential boolean not null default true,
  include_in_cashflow boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null,
  currency text not null default 'GBP',
  due_date date not null,
  recurrence jsonb not null default '{"frequency":"monthly","interval":1}',
  category_id text not null references public.categories(id) on delete restrict,
  account_id text references public.accounts(id) on delete set null,
  include_in_cashflow boolean not null default true,
  status text not null default 'active',
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  currency text not null default 'GBP',
  target_date date not null,
  priority text not null default 'medium',
  monthly_contribution numeric not null default 0,
  include_in_net_worth boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric not null,
  currency text not null default 'GBP',
  apr numeric not null default 0,
  minimum_payment numeric not null default 0,
  due_date date not null,
  lender text not null,
  account_id text references public.accounts(id) on delete set null,
  include_in_net_worth boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manual_finance_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  direction text not null,
  amount numeric not null,
  currency text not null default 'GBP',
  due_date date,
  recurrence jsonb,
  apr numeric,
  minimum_payment numeric,
  counterparty text,
  include_in_cashflow boolean not null default true,
  include_in_net_worth boolean not null default true,
  notes text,
  status text not null default 'active',
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  assets_total numeric not null,
  liabilities_total numeric not null,
  net_worth numeric not null,
  currency text not null default 'GBP',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  summary text not null,
  evidence text[] not null default '{}',
  assumptions text[] not null default '{}',
  next_action text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.provider_sync_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id text not null references public.bank_connections(id) on delete cascade,
  provider text not null,
  status text not null,
  message text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id text not null references public.bank_connections(id) on delete cascade,
  provider text not null,
  token_reference text,
  encrypted_payload jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.bank_connections enable row level security;
alter table public.provider_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_periods enable row level security;
alter table public.bills enable row level security;
alter table public.subscriptions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.debts enable row level security;
alter table public.manual_finance_items enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.ai_insights enable row level security;
alter table public.alerts enable row level security;
alter table public.provider_sync_events enable row level security;
alter table public.provider_tokens enable row level security;
alter table public.audit_log enable row level security;

do $$
declare
  table_name text;
  tables text[] := array[
    'profiles',
    'accounts',
    'bank_connections',
    'provider_accounts',
    'transactions',
    'categories',
    'budgets',
    'budget_periods',
    'bills',
    'subscriptions',
    'savings_goals',
    'debts',
    'manual_finance_items',
    'net_worth_snapshots',
    'ai_insights',
    'alerts',
    'provider_sync_events',
    'provider_tokens',
    'audit_log'
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
