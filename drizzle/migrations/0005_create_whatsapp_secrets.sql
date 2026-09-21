CREATE TABLE public.whatsapp_secrets (
  provider text PRIMARY KEY,
  instance_token text NOT NULL DEFAULT '',
  client_token text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_secrets TO service_role;

ALTER TABLE public.whatsapp_secrets ENABLE ROW LEVEL SECURITY;
