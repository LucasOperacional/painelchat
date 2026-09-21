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