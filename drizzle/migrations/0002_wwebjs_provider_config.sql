ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS webhook_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');