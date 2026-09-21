CREATE TABLE public.estoque_categorias (
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

CREATE POLICY estoque_categorias_select ON public.estoque_categorias
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY estoque_categorias_insert ON public.estoque_categorias
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_categorias_update ON public.estoque_categorias
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_categorias_delete ON public.estoque_categorias
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.estoque_itens (
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

CREATE INDEX estoque_itens_categoria_status_idx ON public.estoque_itens (categoria_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_itens TO authenticated;
GRANT ALL ON public.estoque_itens TO service_role;
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY estoque_itens_select ON public.estoque_itens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_itens_insert ON public.estoque_itens
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_itens_update ON public.estoque_itens
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY estoque_itens_delete ON public.estoque_itens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.pix_charges
  ADD COLUMN estoque_categoria_id uuid REFERENCES public.estoque_categorias(id) ON DELETE SET NULL;