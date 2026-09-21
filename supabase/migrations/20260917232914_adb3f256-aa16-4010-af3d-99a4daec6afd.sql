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

ALTER TABLE public.pix_charges ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'misticpay';