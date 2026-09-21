ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lid text;
CREATE INDEX IF NOT EXISTS contacts_lid_idx ON public.contacts (lid);