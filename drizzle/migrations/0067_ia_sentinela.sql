-- lovable-cron-fallback-reviewed: detectar queda das APIs de WhatsApp e mensagens perdidas exige verificação ativa a cada 2 minutos (720 execuções/dia); substitui o job anterior do monitor; custo informado ao usuário.
CREATE TABLE IF NOT EXISTS public.sentinela_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo boolean NOT NULL DEFAULT true,
  intervalo_minutos integer NOT NULL DEFAULT 2,
  auto_reconectar boolean NOT NULL DEFAULT true,
  auto_reenviar boolean NOT NULL DEFAULT true,
  auto_recuperar_midia boolean NOT NULL DEFAULT true,
  auto_limpar_duplicadas boolean NOT NULL DEFAULT true,
  seguranca_modo text NOT NULL DEFAULT 'misto',
  limite_req_minuto integer NOT NULL DEFAULT 240,
  bloqueio_minutos integer NOT NULL DEFAULT 15,
  avisar_painel boolean NOT NULL DEFAULT true,
  avisar_whatsapp boolean NOT NULL DEFAULT true,
  numero_alerta text NOT NULL DEFAULT '5562910002123',
  resumo_ia text NOT NULL DEFAULT '',
  resumo_ia_em timestamptz,
  cron_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sentinela_settings TO authenticated;
GRANT ALL ON public.sentinela_settings TO service_role;
ALTER TABLE public.sentinela_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentinela_settings_admin ON public.sentinela_settings;
CREATE POLICY sentinela_settings_admin ON public.sentinela_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.sentinela_settings (ativo)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.sentinela_settings);

CREATE TABLE IF NOT EXISTS public.sentinela_ciclos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  duracao_ms integer NOT NULL DEFAULT 0,
  verificacoes integer NOT NULL DEFAULT 0,
  problemas integer NOT NULL DEFAULT 0,
  corrigidos integer NOT NULL DEFAULT 0,
  severidade text NOT NULL DEFAULT 'ok',
  resumo text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sentinela_ciclos_inicio_idx ON public.sentinela_ciclos (iniciado_em DESC);
GRANT SELECT ON public.sentinela_ciclos TO authenticated;
GRANT ALL ON public.sentinela_ciclos TO service_role;
ALTER TABLE public.sentinela_ciclos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentinela_ciclos_admin ON public.sentinela_ciclos;
CREATE POLICY sentinela_ciclos_admin ON public.sentinela_ciclos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.sentinela_achados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid REFERENCES public.sentinela_ciclos(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  severidade text NOT NULL DEFAULT 'aviso',
  titulo text NOT NULL DEFAULT '',
  detalhe text NOT NULL DEFAULT '',
  alvo text NOT NULL DEFAULT '',
  acao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sentinela_achados_created_idx ON public.sentinela_achados (created_at DESC);
CREATE INDEX IF NOT EXISTS sentinela_achados_status_idx ON public.sentinela_achados (status);
GRANT SELECT ON public.sentinela_achados TO authenticated;
GRANT ALL ON public.sentinela_achados TO service_role;
ALTER TABLE public.sentinela_achados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentinela_achados_admin ON public.sentinela_achados;
CREATE POLICY sentinela_achados_admin ON public.sentinela_achados
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.sentinela_trafego (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  rota text NOT NULL DEFAULT '',
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  requisicoes integer NOT NULL DEFAULT 0,
  total_bloqueios integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  motivo text NOT NULL DEFAULT '',
  ultimo_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sentinela_trafego_ip_idx ON public.sentinela_trafego (ip);
GRANT SELECT ON public.sentinela_trafego TO authenticated;
GRANT ALL ON public.sentinela_trafego TO service_role;
ALTER TABLE public.sentinela_trafego ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentinela_trafego_admin ON public.sentinela_trafego;
CREATE POLICY sentinela_trafego_admin ON public.sentinela_trafego
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  evento text NOT NULL DEFAULT '',
  external_id text,
  status text NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  http_status integer,
  erro text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_eventos_status_idx ON public.webhook_eventos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_eventos_external_idx ON public.webhook_eventos (external_id);
GRANT SELECT ON public.webhook_eventos TO authenticated;
GRANT ALL ON public.webhook_eventos TO service_role;
ALTER TABLE public.webhook_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_eventos_admin ON public.webhook_eventos;
CREATE POLICY webhook_eventos_admin ON public.webhook_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DELETE FROM public.messages m
USING public.messages d
WHERE m.external_id IS NOT NULL
  AND m.conversation_id = d.conversation_id
  AND m.external_id = d.external_id
  AND (m.created_at, m.id) > (d.created_at, d.id);

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_external_idx
  ON public.messages (conversation_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_token text;
BEGIN
  SELECT cron_token INTO v_token FROM public.sentinela_settings ORDER BY created_at LIMIT 1;

  PERFORM cron.unschedule('monitor-conexoes-whatsapp')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-conexoes-whatsapp');

  PERFORM cron.unschedule('ia-sentinela')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ia-sentinela');

  PERFORM cron.schedule(
    'ia-sentinela',
    '*/2 * * * *',
    format(
      $cmd$select net.http_post(
        url := 'https://project--39b1da47-cdc6-44f9-86c6-8cf9e1e4fbad-dev.lovable.app/api/public/sentinela',
        headers := jsonb_build_object('Content-Type','application/json','x-sentinela-token',%L),
        body := '{}'::jsonb
      );$cmd$,
      v_token
    )
  );
END
$$;