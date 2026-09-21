alter table public.whatsapp_config
  add column if not exists webhook_url text,
  add column if not exists webhook_synced_at timestamptz;