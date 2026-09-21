CREATE TABLE IF NOT EXISTS public.divulgazap_secrets (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.divulgazap_secrets TO service_role;

ALTER TABLE public.divulgazap_secrets ENABLE ROW LEVEL SECURITY;