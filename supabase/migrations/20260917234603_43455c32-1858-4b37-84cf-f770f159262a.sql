ALTER TABLE public.efi_secrets
  ADD COLUMN IF NOT EXISTS certificate_p12 text,
  ADD COLUMN IF NOT EXISTS certificate_name text,
  ADD COLUMN IF NOT EXISTS certificate_password text;