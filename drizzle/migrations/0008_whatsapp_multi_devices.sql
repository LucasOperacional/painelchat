ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_secrets ADD COLUMN IF NOT EXISTS config_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

UPDATE public.whatsapp_secrets s
SET config_id = c.id
FROM (SELECT id FROM public.whatsapp_config ORDER BY created_at LIMIT 1) c
WHERE s.config_id = '00000000-0000-0000-0000-000000000000'::uuid;

ALTER TABLE public.whatsapp_secrets DROP CONSTRAINT IF EXISTS whatsapp_secrets_pkey;
ALTER TABLE public.whatsapp_secrets ADD PRIMARY KEY (provider, config_id);

UPDATE public.whatsapp_config
SET is_default = true
WHERE id = (SELECT id FROM public.whatsapp_config ORDER BY created_at LIMIT 1);

UPDATE public.whatsapp_config SET label = 'Dispositivo principal' WHERE label = '';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL;