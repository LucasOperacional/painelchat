ALTER TABLE public.inbound_settings ADD COLUMN IF NOT EXISTS sync_history boolean NOT NULL DEFAULT true;
INSERT INTO public.inbound_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;