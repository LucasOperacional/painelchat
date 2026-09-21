-- Campos visuais do card compacto de dispositivo
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT 'Suporte',
  ADD COLUMN IF NOT EXISTS display_id text;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_display_id_key
  ON public.whatsapp_config (display_id)
  WHERE display_id IS NOT NULL;

DO $$
DECLARE
  rec record;
  next_id integer := 352;
BEGIN
  FOR rec IN
    SELECT id FROM public.whatsapp_config
    WHERE display_id IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.whatsapp_config
    SET display_id = next_id::text
    WHERE id = rec.id;
    next_id := next_id + 1;
  END LOOP;
END $$;
