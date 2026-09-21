DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='agent_status') THEN
    CREATE TYPE public.agent_status AS ENUM ('available', 'away', 'offline');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='conversation_status') THEN
    CREATE TYPE public.conversation_status AS ENUM ('waiting', 'open', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='message_direction') THEN
    CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound', 'system');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status public.agent_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "roles_select_auth" ON public.user_roles;
CREATE POLICY "roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "roles_admin_write" ON public.user_roles;
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_admin BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'agent'::public.app_role ELSE 'admin'::public.app_role END);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#0f766e',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dept_select_auth" ON public.departments;
CREATE POLICY "dept_select_auth" ON public.departments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "dept_admin_write" ON public.departments;
CREATE POLICY "dept_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  greeting TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queues TO authenticated;
GRANT ALL ON public.queues TO service_role;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "queues_select_auth" ON public.queues;
CREATE POLICY "queues_select_auth" ON public.queues FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "queues_admin_write" ON public.queues;
CREATE POLICY "queues_admin_write" ON public.queues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.queue_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (queue_id, agent_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_agents TO authenticated;
GRANT ALL ON public.queue_agents TO service_role;
ALTER TABLE public.queue_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qa_select_auth" ON public.queue_agents;
CREATE POLICY "qa_select_auth" ON public.queue_agents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "qa_admin_write" ON public.queue_agents;
CREATE POLICY "qa_admin_write" ON public.queue_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_all_auth" ON public.contacts;
CREATE POLICY "contacts_all_auth" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.queues(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.conversation_status NOT NULL DEFAULT 'waiting',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON public.conversations(status);
CREATE INDEX IF NOT EXISTS conversations_assigned_idx ON public.conversations(assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conv_all_auth" ON public.conversations;
CREATE POLICY "conv_all_auth" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction public.message_direction NOT NULL DEFAULT 'outbound',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_all_auth" ON public.messages;
CREATE POLICY "msg_all_auth" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_queue UUID REFERENCES public.queues(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transfers_select_auth" ON public.transfers;
CREATE POLICY "transfers_select_auth" ON public.transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "transfers_insert_auth" ON public.transfers;
CREATE POLICY "transfers_insert_auth" ON public.transfers FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

INSERT INTO public.departments (id, name, description, color) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Comercial', 'Vendas e novos clientes', '#0f766e'),
  ('11111111-1111-1111-1111-111111111102', 'Suporte', 'Atendimento técnico', '#1d4ed8'),
  ('11111111-1111-1111-1111-111111111103', 'Financeiro', 'Cobrança e faturas', '#b45309')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.queues (id, name, department_id, greeting, priority) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Vendas', '11111111-1111-1111-1111-111111111101', 'Olá! Bem-vindo ao time comercial.', 1),
  ('22222222-2222-2222-2222-222222222202', 'Suporte N1', '11111111-1111-1111-1111-111111111102', 'Olá! Em que podemos ajudar?', 1),
  ('22222222-2222-2222-2222-222222222203', 'Suporte N2', '11111111-1111-1111-1111-111111111102', 'Você está com o time especializado.', 2),
  ('22222222-2222-2222-2222-222222222204', 'Cobrança', '11111111-1111-1111-1111-111111111103', 'Olá! Setor financeiro falando.', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contacts (id, name, phone) VALUES
  ('33333333-3333-3333-3333-333333333301', 'Ana Ribeiro', '+55 11 98888-1010'),
  ('33333333-3333-3333-3333-333333333302', 'Carlos Menezes', '+55 21 97777-2020'),
  ('33333333-3333-3333-3333-333333333303', 'Juliana Prado', '+55 31 96666-3030'),
  ('33333333-3333-3333-3333-333333333304', 'Rafael Souza', '+55 41 95555-4040'),
  ('33333333-3333-3333-3333-333333333305', 'Mariana Lopes', '+55 51 94444-5050')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conversations (id, contact_id, queue_id, department_id, status, last_message_at, created_at) VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'waiting', now() - interval '5 minutes', now() - interval '20 minutes'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102', 'waiting', now() - interval '12 minutes', now() - interval '40 minutes'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111103', 'waiting', now() - interval '1 hour', now() - interval '2 hours'),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102', 'waiting', now() - interval '3 hours', now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'closed', now() - interval '2 days', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.messages (conversation_id, direction, body, created_at) VALUES
  ('44444444-4444-4444-4444-444444444401', 'inbound', 'Oi, gostaria de saber os planos disponíveis.', now() - interval '20 minutes'),
  ('44444444-4444-4444-4444-444444444401', 'inbound', 'Pode me mandar os valores?', now() - interval '5 minutes'),
  ('44444444-4444-4444-4444-444444444402', 'inbound', 'Meu aplicativo não está abrindo desde ontem.', now() - interval '40 minutes'),
  ('44444444-4444-4444-4444-444444444402', 'inbound', 'Já tentei reinstalar e continua igual.', now() - interval '12 minutes'),
  ('44444444-4444-4444-4444-444444444403', 'inbound', 'Recebi uma fatura em duplicidade este mês.', now() - interval '2 hours'),
  ('44444444-4444-4444-4444-444444444403', 'inbound', 'Podem verificar por favor?', now() - interval '1 hour'),
  ('44444444-4444-4444-4444-444444444404', 'inbound', 'A integração com o sistema parou de sincronizar.', now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444405', 'inbound', 'Obrigada pelo atendimento!', now() - interval '2 days');

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='chatbot_action') THEN
    CREATE TYPE public.chatbot_action AS ENUM ('message', 'transfer_queue', 'transfer_department', 'ai', 'close');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='chatbot_state') THEN
    CREATE TYPE public.chatbot_state AS ENUM ('menu', 'ai', 'handoff', 'done');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Atendimento automático',
  is_active BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! Sou o assistente virtual da central. Escolha uma opção digitando o número:',
  menu_footer TEXT NOT NULL DEFAULT 'Digite *0* a qualquer momento para falar com um atendente.',
  invalid_option_message TEXT NOT NULL DEFAULT 'Não entendi. Responda com o número de uma das opções.',
  fallback_message TEXT NOT NULL DEFAULT 'Vou te encaminhar para um atendente humano. Um momento, por favor.',
  attempt_limit INTEGER NOT NULL DEFAULT 3,
  transfer_keywords TEXT[] NOT NULL DEFAULT ARRAY['atendente','humano','pessoa','falar com alguem','falar com alguém','0'],
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_instructions TEXT NOT NULL DEFAULT 'Você é o assistente virtual da central de atendimento. Responda em português do Brasil, de forma curta, cordial e objetiva. Nunca invente preços, prazos ou dados que você não conhece.',
  ai_transfer_on_unknown BOOLEAN NOT NULL DEFAULT true,
  hours_enabled BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  business_hours JSONB NOT NULL DEFAULT '[{"day":0,"enabled":false,"start":"09:00","end":"18:00"},{"day":1,"enabled":true,"start":"08:00","end":"18:00"},{"day":2,"enabled":true,"start":"08:00","end":"18:00"},{"day":3,"enabled":true,"start":"08:00","end":"18:00"},{"day":4,"enabled":true,"start":"08:00","end":"18:00"},{"day":5,"enabled":true,"start":"08:00","end":"18:00"},{"day":6,"enabled":false,"start":"09:00","end":"13:00"}]'::jsonb,
  outside_hours_message TEXT NOT NULL DEFAULT 'Nosso atendimento está fora do horário agora. Deixe sua mensagem que responderemos no próximo horário de funcionamento.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbots TO authenticated;
GRANT ALL ON public.chatbots TO service_role;
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chatbots_select_auth" ON public.chatbots;
CREATE POLICY "chatbots_select_auth" ON public.chatbots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chatbots_admin_write" ON public.chatbots;
CREATE POLICY "chatbots_admin_write" ON public.chatbots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.chatbot_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  label TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT '',
  action public.chatbot_action NOT NULL DEFAULT 'transfer_queue',
  queue_id UUID REFERENCES public.queues(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chatbot_id, option_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_options TO authenticated;
GRANT ALL ON public.chatbot_options TO service_role;
ALTER TABLE public.chatbot_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chatbot_options_select_auth" ON public.chatbot_options;
CREATE POLICY "chatbot_options_select_auth" ON public.chatbot_options FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chatbot_options_admin_write" ON public.chatbot_options;
CREATE POLICY "chatbot_options_admin_write" ON public.chatbot_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  chatbot_id UUID REFERENCES public.chatbots(id) ON DELETE SET NULL,
  state public.chatbot_state NOT NULL DEFAULT 'menu',
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chatbot_sessions TO authenticated;
GRANT ALL ON public.chatbot_sessions TO service_role;
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chatbot_sessions_select_auth" ON public.chatbot_sessions;
CREATE POLICY "chatbot_sessions_select_auth" ON public.chatbot_sessions FOR SELECT TO authenticated USING (true);

INSERT INTO public.chatbots (id, name, is_active) VALUES
  ('44444444-4444-4444-4444-444444444401', 'Atendimento automático', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chatbot_options (chatbot_id, option_key, label, response, action, queue_id, department_id, sort_order)
SELECT '44444444-4444-4444-4444-444444444401', '1', 'Falar com um atendente', 'Perfeito! Encaminhando para um atendente.', 'transfer_queue'::public.chatbot_action,
       q.id, q.department_id, 1
FROM public.queues q WHERE q.is_active ORDER BY q.priority LIMIT 1
ON CONFLICT (chatbot_id, option_key) DO NOTHING;

INSERT INTO public.chatbot_options (chatbot_id, option_key, label, response, action, sort_order) VALUES
  ('44444444-4444-4444-4444-444444444401', '2', 'Tirar uma dúvida com o assistente', 'Claro! Pode escrever sua dúvida que eu respondo.', 'ai', 2),
  ('44444444-4444-4444-4444-444444444401', '3', 'Encerrar o atendimento', 'Obrigado pelo contato! Atendimento encerrado.', 'close', 3)
ON CONFLICT (chatbot_id, option_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Nova divulgação',
  channel text NOT NULL DEFAULT 'divulgazap',
  device_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  targets text[] NOT NULL DEFAULT '{}',
  message text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  repeat_minutes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broadcast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  target text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_runs_campaign_idx ON public.broadcast_runs (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_campaigns_due_idx ON public.broadcast_campaigns (is_active, next_run_at);

CREATE TABLE IF NOT EXISTS public.broadcast_settings (
  id boolean PRIMARY KEY DEFAULT true,
  cron_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.broadcast_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT ALL ON public.broadcast_campaigns TO service_role;
GRANT SELECT ON public.broadcast_runs TO authenticated;
GRANT ALL ON public.broadcast_runs TO service_role;
GRANT ALL ON public.broadcast_settings TO service_role;

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam divulgacoes" ON public.broadcast_campaigns;
CREATE POLICY "Admins gerenciam divulgacoes" ON public.broadcast_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins veem envios" ON public.broadcast_runs;
CREATE POLICY "Admins veem envios" ON public.broadcast_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.inbound_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ignore_groups boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inbound_settings TO authenticated;
GRANT ALL ON public.inbound_settings TO service_role;

ALTER TABLE public.inbound_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbound settings readable" ON public.inbound_settings;
CREATE POLICY "inbound settings readable" ON public.inbound_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.inbound_settings (id, ignore_groups)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.button_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  options TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.button_menus TO authenticated;
GRANT ALL ON public.button_menus TO service_role;

ALTER TABLE public.button_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Atendentes leem menus de botao" ON public.button_menus;
CREATE POLICY "Atendentes leem menus de botao"
  ON public.button_menus FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam menus de botao" ON public.button_menus;
CREATE POLICY "Admins gerenciam menus de botao"
  ON public.button_menus FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));