CREATE TABLE IF NOT EXISTS public.pix_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  whatsapp_config_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  paid_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pix_charges TO authenticated;
GRANT ALL ON public.pix_charges TO service_role;

ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pix_charges_select_authenticated" ON public.pix_charges
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS pix_charges_conversation_idx ON public.pix_charges(conversation_id);