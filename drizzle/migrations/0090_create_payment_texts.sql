CREATE TABLE public.payment_texts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_texts TO authenticated;
GRANT ALL ON public.payment_texts TO service_role;
ALTER TABLE public.payment_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_texts_auth ON public.payment_texts FOR ALL TO authenticated USING (true) WITH CHECK (true);