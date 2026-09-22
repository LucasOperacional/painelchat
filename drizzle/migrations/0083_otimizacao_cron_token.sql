ALTER TABLE public.otimizacao_settings
  ADD COLUMN IF NOT EXISTS cron_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;