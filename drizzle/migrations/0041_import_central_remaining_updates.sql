CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.efi_secrets (
  provider text PRIMARY KEY DEFAULT 'efi',
  client_id text NOT NULL,
  client_secret text NOT NULL,
  environment text NOT NULL DEFAULT 'producao',
  pix_key text,
  relay_url text,
  relay_token text,
  expiration_seconds integer NOT NULL DEFAULT 3600,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.efi_secrets TO service_role;
ALTER TABLE public.efi_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.efi_secrets
  ADD COLUMN IF NOT EXISTS certificate_p12 text,
  ADD COLUMN IF NOT EXISTS certificate_name text,
  ADD COLUMN IF NOT EXISTS certificate_password text;

ALTER TABLE public.pix_charges ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'misticpay';

create table if not exists public.altispay_secrets (
  provider text primary key,
  api_key text,
  base_url text,
  environment text not null default 'producao',
  default_payer_name text,
  default_payer_document text,
  default_payer_email text,
  webhook_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.altispay_secrets to service_role;
alter table public.altispay_secrets enable row level security;

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

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mentions_me boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS access_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE public.project_domains ADD COLUMN IF NOT EXISTS access_key text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS projects_access_key_key ON public.projects (access_key);

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

REVOKE EXECUTE ON FUNCTION public.bank_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_balance() TO authenticated, service_role;

ALTER TABLE public.transfers REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='transfers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transfers;
  END IF;
END $$;