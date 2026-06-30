create table if not exists public.notification_preferences (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  enabled boolean not null default true,
  channels text[] not null default '{in_app}',
  low_balance_threshold numeric not null default 250,
  budget_warning_percentage numeric not null default 0.85,
  bill_reminder_days integer not null default 7,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type)
);

create table if not exists public.notification_rules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  enabled boolean not null default true,
  threshold_amount numeric,
  threshold_percentage numeric,
  days_before integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  severity text not null,
  channel text not null default 'in_app',
  title text not null,
  body text not null,
  privacy_safe_title text not null,
  privacy_safe_body text not null,
  action_href text,
  entity_type text,
  entity_id text,
  status text not null default 'unread',
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_hash text not null,
  browser text not null,
  permission text not null default 'default',
  status text not null default 'placeholder',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Sensitive push subscription placeholders. Do not expose endpoint internals to browser UI or logs.';

alter table public.notification_preferences enable row level security;
alter table public.notification_rules enable row level security;
alter table public.app_notifications enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare
  table_name text;
  tables text[] := array[
    'notification_preferences',
    'notification_rules',
    'app_notifications',
    'push_subscriptions'
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
