ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS access_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE public.project_domains ADD COLUMN IF NOT EXISTS access_key text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS projects_access_key_key ON public.projects (access_key);