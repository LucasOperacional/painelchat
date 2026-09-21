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
