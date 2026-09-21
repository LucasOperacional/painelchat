CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_central boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  logo_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '#0f766e',
  accent_color text NOT NULL DEFAULT '#14b8a6',
  headline text NOT NULL DEFAULT '',
  tagline text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_public_read ON public.projects FOR SELECT TO anon USING (is_active);
CREATE POLICY projects_select_auth ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY projects_admin_write ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.project_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_domains_project_id_idx ON public.project_domains(project_id);

GRANT SELECT ON public.project_domains TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_domains TO authenticated;
GRANT ALL ON public.project_domains TO service_role;

ALTER TABLE public.project_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_domains_public_read ON public.project_domains FOR SELECT TO anon USING (true);
CREATE POLICY project_domains_select_auth ON public.project_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY project_domains_admin_write ON public.project_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.projects (name, slug, is_central, headline, tagline)
VALUES ('Central', 'central', true, 'Central de Multi Atendimento', 'Multi atendimento');
