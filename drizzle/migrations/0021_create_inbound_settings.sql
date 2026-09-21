CREATE TABLE IF NOT EXISTS public.inbound_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ignore_groups boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inbound_settings TO authenticated;
GRANT ALL ON public.inbound_settings TO service_role;

ALTER TABLE public.inbound_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbound settings readable" ON public.inbound_settings;
CREATE POLICY "inbound settings readable" ON public.inbound_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.inbound_settings (id, ignore_groups)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;