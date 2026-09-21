CREATE TABLE public.cobranca_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'geral',
  url TEXT NOT NULL DEFAULT '',
  login TEXT NOT NULL DEFAULT '',
  senha TEXT NOT NULL DEFAULT '',
  vencimento DATE,
  lembrete_dias INTEGER NOT NULL DEFAULT 5,
  observacoes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_acessos TO authenticated;
GRANT ALL ON public.cobranca_acessos TO service_role;
ALTER TABLE public.cobranca_acessos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam acessos" ON public.cobranca_acessos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC NOT NULL DEFAULT 0,
  vencimento DATE NOT NULL DEFAULT CURRENT_DATE,
  boleto_url TEXT NOT NULL DEFAULT '',
  linha_digitavel TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  dias_antes INTEGER NOT NULL DEFAULT 3,
  hora_envio TEXT NOT NULL DEFAULT '09:00',
  recorrencia TEXT NOT NULL DEFAULT 'unica',
  device_id UUID REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  proximo_envio TIMESTAMPTZ,
  ultimo_envio TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'agendada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobrancas TO authenticated;
GRANT ALL ON public.cobrancas TO service_role;
ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe gerencia cobrancas" ON public.cobrancas
  FOR ALL TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE public.cobranca_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id UUID NOT NULL REFERENCES public.cobrancas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'cobranca',
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  detalhe TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cobranca_envios TO authenticated;
GRANT ALL ON public.cobranca_envios TO service_role;
ALTER TABLE public.cobranca_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe le historico de cobrancas" ON public.cobranca_envios
  FOR SELECT TO authenticated USING (TRUE);

CREATE TABLE public.cobranca_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  cron_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.cobranca_settings TO service_role;
ALTER TABLE public.cobranca_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX cobrancas_proximo_envio_idx ON public.cobrancas (ativo, proximo_envio);