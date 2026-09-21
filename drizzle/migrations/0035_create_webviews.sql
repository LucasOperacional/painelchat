CREATE TABLE IF NOT EXISTS public.webviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  open_external BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webviews TO authenticated;
GRANT ALL ON public.webviews TO service_role;

ALTER TABLE public.webviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webviews_select_auth" ON public.webviews;
CREATE POLICY "webviews_select_auth" ON public.webviews FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "webviews_admin_write" ON public.webviews;
CREATE POLICY "webviews_admin_write" ON public.webviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));