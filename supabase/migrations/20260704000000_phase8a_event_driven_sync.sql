alter table if exists public.transactions
  add column if not exists provider_status text,
  add column if not exists provider_deleted_at timestamptz,
  add column if not exists provider_restored_at timestamptz,
  add column if not exists notes text;

create table if not exists public.provider_webhook_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  connection_id text not null references public.bank_connections(id) on delete cascade,
  account_ids text[] not null default '{}',
  error_message text,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.sync_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  scope text not null,
  connection_id text not null references public.bank_connections(id) on delete cascade,
  account_ids text[] not null default '{}',
  status text not null default 'pending',
  reason text not null,
  idempotency_key text not null,
  attempts integer not null default 0,
  error_message text,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.provider_webhook_events enable row level security;
alter table public.sync_jobs enable row level security;

do $$
declare
  table_name text;
  tables text[] := array[
    'provider_webhook_events',
    'sync_jobs'
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
