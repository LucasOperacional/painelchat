CREATE TABLE IF NOT EXISTS public.loja_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_pix boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'auto',
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT 'random',
  recebedor_nome text NOT NULL DEFAULT '',
  recebedor_cidade text NOT NULL DEFAULT 'SAO PAULO',
  mensagem_cobranca text NOT NULL DEFAULT 'Segue o Pix para liberar o seu acesso. Assim que o pagamento cair, envio o login automaticamente.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.loja_settings TO authenticated;
GRANT ALL ON public.loja_settings TO service_role;

ALTER TABLE public.loja_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loja_settings_select ON public.loja_settings;
CREATE POLICY loja_settings_select ON public.loja_settings
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS loja_settings_admin ON public.loja_settings;
CREATE POLICY loja_settings_admin ON public.loja_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.loja_settings TO authenticated;

INSERT INTO public.loja_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;