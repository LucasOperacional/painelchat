ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS login_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS dashboard_logo_url TEXT;