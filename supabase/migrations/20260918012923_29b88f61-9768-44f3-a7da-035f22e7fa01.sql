CREATE TABLE public.wavoip_secrets (
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