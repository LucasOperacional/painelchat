ALTER TABLE public.button_menus
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS footer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS button_text text NOT NULL DEFAULT 'Ver menu',
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'button_menus_kind_check') THEN
    ALTER TABLE public.button_menus
      ADD CONSTRAINT button_menus_kind_check CHECK (kind IN ('text','button','list','poll'));
  END IF;
END $$;