-- WhatsApp config (Evolution)
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT '',
  instance_id text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT 'central',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'disconnected',
  last_qr text,
  last_event text,
  default_queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver a configuracao do WhatsApp" ON public.whatsapp_config;
CREATE POLICY "Admins podem ver a configuracao do WhatsApp"
ON public.whatsapp_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS wa_jid text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_wa_jid_key ON public.contacts (wa_jid) WHERE wa_jid IS NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;
CREATE INDEX IF NOT EXISTS messages_external_id_idx ON public.messages (external_id);

INSERT INTO public.whatsapp_config (base_url, instance_id)
SELECT '', ''
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_config);

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS webhook_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

-- AI config
CREATE TABLE IF NOT EXISTS public.ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'gemini',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  system_prompt text NOT NULL DEFAULT 'Você é um atendente educado de uma central de atendimento brasileira. Responda em português do Brasil, de forma curta, clara e cordial.',
  is_enabled boolean NOT NULL DEFAULT false,
  auto_reply boolean NOT NULL DEFAULT false,
  manus_agent_profile text NOT NULL DEFAULT 'lite',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_config TO authenticated;
GRANT ALL ON public.ai_config TO service_role;

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ver a configuracao de IA" ON public.ai_config;
CREATE POLICY "Autenticados podem ver a configuracao de IA"
ON public.ai_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam a configuracao de IA" ON public.ai_config;
CREATE POLICY "Admins gerenciam a configuracao de IA"
ON public.ai_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_config (provider, model)
SELECT 'gemini', 'gemini-2.5-flash'
WHERE NOT EXISTS (SELECT 1 FROM public.ai_config);

-- Secrets tables
CREATE TABLE IF NOT EXISTS public.ai_secrets (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ai_secrets FROM anon, authenticated;
GRANT ALL ON public.ai_secrets TO service_role;
ALTER TABLE public.ai_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.whatsapp_secrets (
  provider text PRIMARY KEY,
  instance_token text NOT NULL DEFAULT '',
  client_token text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_secrets TO service_role;
ALTER TABLE public.whatsapp_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signature_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.nfse_secrets (
  provider text PRIMARY KEY,
  api_token text NOT NULL,
  base_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.nfse_secrets TO service_role;
ALTER TABLE public.nfse_secrets ENABLE ROW LEVEL SECURITY;

-- Multi devices
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_secrets ADD COLUMN IF NOT EXISTS config_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

UPDATE public.whatsapp_secrets s
SET config_id = c.id
FROM (SELECT id FROM public.whatsapp_config ORDER BY created_at LIMIT 1) c
WHERE s.config_id = '00000000-0000-0000-0000-000000000000'::uuid;

ALTER TABLE public.whatsapp_secrets DROP CONSTRAINT IF EXISTS whatsapp_secrets_pkey;
ALTER TABLE public.whatsapp_secrets ADD PRIMARY KEY (provider, config_id);

UPDATE public.whatsapp_config
SET is_default = true
WHERE id = (SELECT id FROM public.whatsapp_config ORDER BY created_at LIMIT 1);

UPDATE public.whatsapp_config SET label = 'Dispositivo principal' WHERE label = '';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL;

-- Projects (multi tenant)
CREATE TABLE IF NOT EXISTS public.projects (
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

DROP POLICY IF EXISTS projects_public_read ON public.projects;
CREATE POLICY projects_public_read ON public.projects FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS projects_select_auth ON public.projects;
CREATE POLICY projects_select_auth ON public.projects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS projects_admin_write ON public.projects;
CREATE POLICY projects_admin_write ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.project_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_domains_project_id_idx ON public.project_domains(project_id);

GRANT SELECT ON public.project_domains TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_domains TO authenticated;
GRANT ALL ON public.project_domains TO service_role;

ALTER TABLE public.project_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_domains_public_read ON public.project_domains;
CREATE POLICY project_domains_public_read ON public.project_domains FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS project_domains_select_auth ON public.project_domains;
CREATE POLICY project_domains_select_auth ON public.project_domains FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS project_domains_admin_write ON public.project_domains;
CREATE POLICY project_domains_admin_write ON public.project_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.projects (name, slug, is_central, headline, tagline)
SELECT 'Central', 'central', true, 'Central de Multi Atendimento', 'Multi atendimento'
WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE slug = 'central');

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS login_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS dashboard_logo_url TEXT;

-- Device card fields
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT 'Suporte',
  ADD COLUMN IF NOT EXISTS display_id text;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_display_id_key
  ON public.whatsapp_config (display_id)
  WHERE display_id IS NOT NULL;

DO $$
DECLARE
  rec record;
  next_id integer := 352;
BEGIN
  FOR rec IN
    SELECT id FROM public.whatsapp_config
    WHERE display_id IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.whatsapp_config
    SET display_id = next_id::text
    WHERE id = rec.id;
    next_id := next_id + 1;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.divulgazap_secrets (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.divulgazap_secrets TO service_role;
ALTER TABLE public.divulgazap_secrets ENABLE ROW LEVEL SECURITY;

-- Anti duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_digits_unique
  ON public.contacts ((regexp_replace(phone, '\D', '', 'g')));

CREATE UNIQUE INDEX IF NOT EXISTS contacts_wa_jid_unique
  ON public.contacts (wa_jid)
  WHERE wa_jid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_active_per_contact_unique
  ON public.conversations (contact_id)
  WHERE status <> 'closed';

CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  IF NEW.wa_jid IS NOT NULL AND NEW.wa_jid <> '' THEN
    NEW.wa_jid := regexp_replace(split_part(split_part(NEW.wa_jid, '@', 1), ':', 1), '\D', '', 'g')
                  || '@' || COALESCE(NULLIF(split_part(NEW.wa_jid, '@', 2), ''), 's.whatsapp.net');
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_normalize_phone ON public.contacts;
CREATE TRIGGER contacts_normalize_phone
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();

-- Storage anexos
DROP POLICY IF EXISTS "Autenticados enviam anexos" ON storage.objects;
CREATE POLICY "Autenticados enviam anexos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'anexos');

DROP POLICY IF EXISTS "Autenticados leem anexos" ON storage.objects;
CREATE POLICY "Autenticados leem anexos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'anexos');

DROP POLICY IF EXISTS "Autenticados apagam anexos" ON storage.objects;
CREATE POLICY "Autenticados apagam anexos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'anexos');