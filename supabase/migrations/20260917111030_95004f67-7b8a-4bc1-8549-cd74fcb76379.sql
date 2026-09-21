CREATE TABLE IF NOT EXISTS public.misticpay_secrets (
  provider text PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  base_url text,
  auth_mode text NOT NULL DEFAULT 'basic',
  default_payer_name text,
  default_payer_document text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.misticpay_secrets TO service_role;
ALTER TABLE public.misticpay_secrets ENABLE ROW LEVEL SECURITY;