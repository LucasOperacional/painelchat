ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS chat_background_color TEXT NOT NULL DEFAULT '#f1f5f9',
  ADD COLUMN IF NOT EXISTS chat_background_url TEXT;