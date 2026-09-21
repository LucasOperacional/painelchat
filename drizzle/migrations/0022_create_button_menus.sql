CREATE TABLE public.button_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  options TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.button_menus TO authenticated;
GRANT INSERT, UPDATE, DELETE, SELECT ON public.button_menus TO service_role;
GRANT ALL ON public.button_menus TO service_role;

ALTER TABLE public.button_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atendentes leem menus de botao"
  ON public.button_menus FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gerenciam menus de botao"
  ON public.button_menus FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));