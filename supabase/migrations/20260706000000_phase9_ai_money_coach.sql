alter table public.ai_insights
  add column if not exists mode text,
  add column if not exists prompt text,
  add column if not exists redacted_context_summary text,
  add column if not exists response_summary text,
  add column if not exists data_used jsonb not null default '{}'::jsonb,
  add column if not exists model text,
  add column if not exists error_status text;

alter table public.ai_insights enable row level security;

do $$
declare
  table_name text := 'ai_insights';
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
