CREATE TABLE IF NOT EXISTS public.estoque_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  preco numeric(12,2) NOT NULL DEFAULT 0,
  entrega_mensagem text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_categorias TO authenticated;
GRANT ALL ON public.estoque_categorias TO service_role;
ALTER TABLE public.estoque_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_categorias_select ON public.estoque_categorias;
CREATE POLICY estoque_categorias_select ON public.estoque_categorias
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS estoque_categorias_insert ON public.estoque_categorias;
CREATE POLICY estoque_categorias_insert ON public.estoque_categorias
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS estoque_categorias_update ON public.estoque_categorias;
CREATE POLICY estoque_categorias_update ON public.estoque_categorias
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS estoque_categorias_delete ON public.estoque_categorias;
CREATE POLICY estoque_categorias_delete ON public.estoque_categorias
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.estoque_categorias(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT '',
  login text NOT NULL,
  senha text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  extras text NOT NULL DEFAULT '',
  validade date,
  status text NOT NULL DEFAULT 'disponivel',
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  pix_charge_id uuid REFERENCES public.pix_charges(id) ON DELETE SET NULL,
  entregue_para text NOT NULL DEFAULT '',
  vendido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estoque_itens_categoria_status_idx ON public.estoque_itens (categoria_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_itens TO authenticated;
GRANT ALL ON public.estoque_itens TO service_role;
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_itens_select ON public.estoque_itens;
CREATE POLICY estoque_itens_select ON public.estoque_itens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS estoque_itens_insert ON public.estoque_itens;
CREATE POLICY estoque_itens_insert ON public.estoque_itens
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS estoque_itens_update ON public.estoque_itens;
CREATE POLICY estoque_itens_update ON public.estoque_itens
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS estoque_itens_delete ON public.estoque_itens;
CREATE POLICY estoque_itens_delete ON public.estoque_itens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS estoque_categoria_id uuid REFERENCES public.estoque_categorias(id) ON DELETE SET NULL;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lid text;
CREATE INDEX IF NOT EXISTS contacts_lid_idx ON public.contacts (lid);
ALTER TABLE public.inbound_settings ADD COLUMN IF NOT EXISTS sync_history boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_synced_at timestamptz;

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

ALTER TABLE public.loja_settings
  ADD COLUMN IF NOT EXISTS bot_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_primeiro_contato boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_palavras text NOT NULL DEFAULT 'loja,comprar,preco,preço,catalogo,catálogo,menu,acesso,login',
  ADD COLUMN IF NOT EXISTS bot_titulo text NOT NULL DEFAULT 'Nossa loja de acessos',
  ADD COLUMN IF NOT EXISTS bot_modo text NOT NULL DEFAULT 'lista',
  ADD COLUMN IF NOT EXISTS bot_saudacao text NOT NULL DEFAULT 'Olá! Sou o atendente automático. Veja os acessos disponíveis:';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loja_settings TO authenticated;
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

INSERT INTO public.loja_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TYPE public.chatbot_action ADD VALUE IF NOT EXISTS 'loja';