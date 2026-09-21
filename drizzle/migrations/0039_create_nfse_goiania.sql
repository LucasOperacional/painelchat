CREATE TABLE public.nfse_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  razao_social TEXT NOT NULL DEFAULT '',
  nome_fantasia TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  inscricao_municipal TEXT NOT NULL DEFAULT '',
  regime_tributario INT NOT NULL DEFAULT 0,
  optante_simples BOOLEAN NOT NULL DEFAULT TRUE,
  incentivador_cultural BOOLEAN NOT NULL DEFAULT FALSE,
  codigo_municipio TEXT NOT NULL DEFAULT '5208707',
  serie_rps TEXT NOT NULL DEFAULT '1',
  proximo_rps INT NOT NULL DEFAULT 1,
  ambiente TEXT NOT NULL DEFAULT 'producao',
  endpoint_url TEXT NOT NULL DEFAULT 'https://nfse.issnetonline.com.br/abrasf204/goiania/nfse.asmx',
  padrao TEXT NOT NULL DEFAULT 'abrasf204',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nfse_config TO authenticated;
GRANT ALL ON public.nfse_config TO service_role;
ALTER TABLE public.nfse_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_config_select ON public.nfse_config FOR SELECT TO authenticated USING (true);

CREATE TABLE public.nfse_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rps_numero INT NOT NULL,
  rps_serie TEXT NOT NULL DEFAULT '1',
  numero_nfse TEXT,
  codigo_verificacao TEXT,
  tomador_cpf_cnpj TEXT NOT NULL DEFAULT '',
  tomador_nome TEXT NOT NULL DEFAULT '',
  tomador_email TEXT NOT NULL DEFAULT '',
  competencia DATE,
  codigo_servico TEXT NOT NULL DEFAULT '',
  cnae TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  valor_servico NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_calculo NUMERIC(14,2) NOT NULL DEFAULT 0,
  aliquota NUMERIC(7,4) NOT NULL DEFAULT 0,
  valor_iss NUMERIC(14,2) NOT NULL DEFAULT 0,
  iss_retido BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  xml_envio TEXT,
  xml_resposta TEXT,
  url_nfse TEXT,
  erro_codigo TEXT,
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfse_notas_status_ck CHECK (status IN ('RASCUNHO','PROCESSANDO','AUTORIZADA','REJEITADA','CANCELADA','SUBSTITUIDA')),
  CONSTRAINT nfse_notas_rps_unq UNIQUE (empresa_id, rps_numero, rps_serie)
);
CREATE INDEX nfse_notas_created_idx ON public.nfse_notas (created_at DESC);
GRANT SELECT ON public.nfse_notas TO authenticated;
GRANT ALL ON public.nfse_notas TO service_role;
ALTER TABLE public.nfse_notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_notas_select ON public.nfse_notas FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.nfse_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfse_id UUID REFERENCES public.nfse_notas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  request TEXT,
  response TEXT,
  status_http INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nfse_eventos_nfse_idx ON public.nfse_eventos (nfse_id, created_at DESC);
GRANT SELECT ON public.nfse_eventos TO authenticated;
GRANT ALL ON public.nfse_eventos TO service_role;
ALTER TABLE public.nfse_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_eventos_select ON public.nfse_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.nfse_notas n WHERE n.id = nfse_eventos.nfse_id
    AND (n.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE OR REPLACE FUNCTION public.nfse_reservar_rps(_empresa UUID)
RETURNS TABLE (numero INT, serie TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_num INT; v_serie TEXT;
BEGIN
  INSERT INTO public.nfse_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
  UPDATE public.nfse_config
     SET proximo_rps = proximo_rps + 1, updated_at = now()
   WHERE id = TRUE
  RETURNING proximo_rps - 1, serie_rps INTO v_num, v_serie;
  RETURN QUERY SELECT v_num, v_serie;
END;
$$;
REVOKE ALL ON FUNCTION public.nfse_reservar_rps(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nfse_reservar_rps(UUID) TO service_role;

INSERT INTO public.nfse_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;