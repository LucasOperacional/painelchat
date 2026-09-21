CREATE TABLE public.broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Nova divulgação',
  channel text NOT NULL DEFAULT 'divulgazap',
  device_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  targets text[] NOT NULL DEFAULT '{}',
  message text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  repeat_minutes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.broadcast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  target text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX broadcast_runs_campaign_idx ON public.broadcast_runs (campaign_id, created_at DESC);
CREATE INDEX broadcast_campaigns_due_idx ON public.broadcast_campaigns (is_active, next_run_at);

CREATE TABLE public.broadcast_settings (
  id boolean PRIMARY KEY DEFAULT true,
  cron_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.broadcast_settings (id) VALUES (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_campaigns TO service_role;
GRANT SELECT ON public.broadcast_runs TO authenticated;
GRANT ALL ON public.broadcast_runs TO service_role;
GRANT ALL ON public.broadcast_settings TO service_role;

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam divulgacoes" ON public.broadcast_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins veem envios" ON public.broadcast_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
