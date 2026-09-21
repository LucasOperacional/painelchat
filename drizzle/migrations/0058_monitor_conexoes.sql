-- Monitoramento das conexões com as APIs de WhatsApp (Evolution / WuzAPI)

CREATE TABLE IF NOT EXISTS public.monitor_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo boolean NOT NULL DEFAULT true,
  numero_alerta text NOT NULL DEFAULT '5562910002123',
  auto_reconectar boolean NOT NULL DEFAULT true,
  intervalo_minutos integer NOT NULL DEFAULT 2,
  cron_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.monitor_settings TO authenticated;
GRANT ALL ON public.monitor_settings TO service_role;
ALTER TABLE public.monitor_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monitor_settings_admin_select ON public.monitor_settings;
CREATE POLICY monitor_settings_admin_select ON public.monitor_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.monitor_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid,
  device_label text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  severidade text NOT NULL DEFAULT 'erro',
  mensagem text NOT NULL DEFAULT '',
  alerta_enviado boolean NOT NULL DEFAULT false,
  alerta_detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monitor_eventos_created_idx ON public.monitor_eventos (created_at DESC);

GRANT SELECT ON public.monitor_eventos TO authenticated;
GRANT ALL ON public.monitor_eventos TO service_role;
ALTER TABLE public.monitor_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monitor_eventos_admin_select ON public.monitor_eventos;
CREATE POLICY monitor_eventos_admin_select ON public.monitor_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Estado do monitor por dispositivo
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS monitor_estado text,
  ADD COLUMN IF NOT EXISTS monitor_desde timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monitor_ultimo_check timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_ultimo_erro text;

INSERT INTO public.monitor_settings (ativo)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.monitor_settings);