CREATE TABLE public.ai_secrets (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.ai_secrets FROM anon, authenticated;
GRANT ALL ON public.ai_secrets TO service_role;

ALTER TABLE public.ai_secrets ENABLE ROW LEVEL SECURITY;