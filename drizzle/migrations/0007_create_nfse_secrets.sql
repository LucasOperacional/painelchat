CREATE TABLE IF NOT EXISTS public.nfse_secrets (
  provider text PRIMARY KEY,
  api_token text NOT NULL,
  base_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.nfse_secrets TO service_role;

ALTER TABLE public.nfse_secrets ENABLE ROW LEVEL SECURITY;
