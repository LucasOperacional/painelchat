CREATE TABLE IF NOT EXISTS public.efi_secrets (
  provider text PRIMARY KEY DEFAULT 'efi',
  client_id text NOT NULL,
  client_secret text NOT NULL,
  environment text NOT NULL DEFAULT 'producao',
  pix_key text,
  relay_url text,
  relay_token text,
  expiration_seconds integer NOT NULL DEFAULT 3600,
  certificate_p12 text,
  certificate_name text,
  certificate_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.efi_secrets TO service_role;
ALTER TABLE public.efi_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pix_charges ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'misticpay';

CREATE TABLE IF NOT EXISTS public.altispay_secrets (
  provider text PRIMARY KEY,
  api_key text,
  base_url text,
  environment text NOT NULL DEFAULT 'producao',
  default_payer_name text,
  default_payer_document text,
  default_payer_email text,
  webhook_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.altispay_secrets TO service_role;
ALTER TABLE public.altispay_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wavoip_secrets (
  provider text PRIMARY KEY DEFAULT 'wavoip',
  device_token text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  base_url text NOT NULL DEFAULT 'https://api.wavoip.com',
  call_url text NOT NULL DEFAULT 'https://app.wavoip.com/call',
  start_if_ready boolean NOT NULL DEFAULT true,
  close_after_call boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wavoip_secrets TO service_role;
ALTER TABLE public.wavoip_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cloudflare_secrets (
  provider text PRIMARY KEY DEFAULT 'cloudflare',
  auth_mode text NOT NULL DEFAULT 'token',
  api_token text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  global_api_key text NOT NULL DEFAULT '',
  account_id text NOT NULL DEFAULT '',
  zone_id text NOT NULL DEFAULT '',
  zone_name text NOT NULL DEFAULT '',
  target_ip text NOT NULL DEFAULT '',
  proxied boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cloudflare_secrets TO service_role;
ALTER TABLE public.cloudflare_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.franchise_settings (
  id boolean PRIMARY KEY DEFAULT true,
  base_domain text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT franchise_settings_singleton CHECK (id)
);
GRANT SELECT ON public.franchise_settings TO authenticated;
GRANT ALL ON public.franchise_settings TO service_role;
ALTER TABLE public.franchise_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Equipe pode ver configuracao de franquias" ON public.franchise_settings;
CREATE POLICY "Equipe pode ver configuracao de franquias"
  ON public.franchise_settings FOR SELECT TO authenticated
  USING (true);
INSERT INTO public.franchise_settings (id, base_domain) VALUES (true, '') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'out',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT 'aleatoria',
  receiver_name text NOT NULL DEFAULT '',
  receiver_document text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'misticpay',
  transaction_id text,
  end_to_end_id text,
  error_message text,
  requested_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_created_at_idx ON public.bank_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON public.bank_transactions (status);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_provider_txid_idx ON public.bank_transactions (provider, transaction_id) WHERE transaction_id IS NOT NULL;

GRANT SELECT ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe pode ver movimentacoes" ON public.bank_transactions;
CREATE POLICY "Equipe pode ver movimentacoes"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.bank_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS bank_transactions_updated_at ON public.bank_transactions;
CREATE TRIGGER bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_touch_updated_at();

CREATE OR REPLACE FUNCTION public.bank_balance()
RETURNS TABLE(total_in numeric, total_out numeric, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction = 'in' AND status = 'pago'), 0)::numeric,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'pago'), 0)::numeric,
    (COALESCE(SUM(amount) FILTER (WHERE direction = 'in' AND status = 'pago'), 0)
     - COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'pago'), 0))::numeric
  FROM public.bank_transactions;
$$;

GRANT EXECUTE ON FUNCTION public.bank_balance() TO authenticated, service_role;