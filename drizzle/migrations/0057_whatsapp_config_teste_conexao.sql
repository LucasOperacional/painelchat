ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_test_status text,
  ADD COLUMN IF NOT EXISTS connection_test_detail text,
  ADD COLUMN IF NOT EXISTS connection_test_at timestamptz;