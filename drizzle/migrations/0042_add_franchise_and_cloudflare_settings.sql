CREATE TABLE IF NOT EXISTS public.franchise_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_domain text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.franchise_settings TO authenticated;
GRANT ALL ON public.franchise_settings TO service_role;
ALTER TABLE public.franchise_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados leem franquia" ON public.franchise_settings;
CREATE POLICY "Autenticados leem franquia" ON public.franchise_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.franchise_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cloudflare_secrets (
  provider text PRIMARY KEY DEFAULT 'cloudflare',
  account_id text NOT NULL DEFAULT '',
  api_token text,
  auth_mode text NOT NULL DEFAULT 'token',
  email text NOT NULL DEFAULT '',
  global_api_key text NOT NULL DEFAULT '',
  proxied boolean NOT NULL DEFAULT true,
  target_ip text NOT NULL DEFAULT '',
  zone_id text NOT NULL DEFAULT '',
  zone_name text NOT NULL DEFAULT '',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cloudflare_secrets TO service_role;
ALTER TABLE public.cloudflare_secrets ENABLE ROW LEVEL SECURITY;