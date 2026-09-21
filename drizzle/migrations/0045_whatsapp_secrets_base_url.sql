ALTER TABLE public.whatsapp_secrets
  ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT '';