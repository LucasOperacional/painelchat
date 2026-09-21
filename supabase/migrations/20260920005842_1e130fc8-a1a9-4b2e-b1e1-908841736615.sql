ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lid text;
CREATE INDEX IF NOT EXISTS contacts_lid_idx ON public.contacts (lid);
ALTER TABLE public.inbound_settings ADD COLUMN IF NOT EXISTS sync_history boolean NOT NULL DEFAULT true;