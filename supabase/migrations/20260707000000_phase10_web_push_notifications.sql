alter table public.push_subscriptions
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth text,
  add column if not exists user_agent text;

create table if not exists public.notification_delivery_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  channel text not null,
  status text not null,
  attempted_at timestamptz not null,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  provider_response_code integer,
  created_at timestamptz not null default now()
);

alter table public.notification_delivery_attempts enable row level security;

do $$
declare
  table_name text := 'notification_delivery_attempts';
begin
  execute format('drop policy if exists "%s select own rows" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%s insert own rows" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%s update own rows" on public.%I', table_name, table_name);
  execute format('drop policy if exists "%s delete own rows" on public.%I', table_name, table_name);

  execute format(
    'create policy "%s select own rows" on public.%I for select using (auth.uid() = user_id)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%s insert own rows" on public.%I for insert with check (auth.uid() = user_id)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%s update own rows" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
    table_name,
    table_name
  );
  execute format(
    'create policy "%s delete own rows" on public.%I for delete using (auth.uid() = user_id)',
    table_name,
    table_name
  );
end $$;

create index if not exists idx_notification_delivery_attempts_user_notification
  on public.notification_delivery_attempts(user_id, notification_id, channel, attempted_at);
