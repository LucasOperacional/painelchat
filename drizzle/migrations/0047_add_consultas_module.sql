CREATE TABLE public.consultas_secrets (
  provider TEXT PRIMARY KEY DEFAULT 'recupera',
  api_key TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT 'https://www.recuperabigtechmundial.com',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.consultas_secrets TO service_role;
ALTER TABLE public.consultas_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.consultas_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  produto TEXT NOT NULL,
  produto_nome TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT '',
  entrada TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ok',
  custo NUMERIC NOT NULL DEFAULT 0,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consultas_historico_user_idx ON public.consultas_historico (user_id, created_at DESC);

GRANT SELECT ON public.consultas_historico TO authenticated;
GRANT ALL ON public.consultas_historico TO service_role;
ALTER TABLE public.consultas_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultas historico leitura propria ou admin"
ON public.consultas_historico
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));