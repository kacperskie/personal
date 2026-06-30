alter table if exists public.transactions
  add column if not exists provider_updated_at timestamptz;

create unique index if not exists transactions_provider_dedupe_idx
  on public.transactions (user_id, account_id, provider_connection_id, provider_transaction_id)
  where provider_connection_id is not null and provider_transaction_id is not null;
