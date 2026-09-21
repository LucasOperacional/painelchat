-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.agent_status AS ENUM ('available', 'away', 'offline');
CREATE TYPE public.conversation_status AS ENUM ('waiting', 'open', 'closed');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound', 'system');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status public.agent_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- Signup trigger: first user becomes admin
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
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Departments
CREATE TABLE public.departments (
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
CREATE POLICY "dept_select_auth" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Queues
CREATE TABLE public.queues (
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
CREATE POLICY "queues_select_auth" ON public.queues FOR SELECT TO authenticated USING (true);
CREATE POLICY "queues_admin_write" ON public.queues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Queue agents
CREATE TABLE public.queue_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (queue_id, agent_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_agents TO authenticated;
GRANT ALL ON public.queue_agents TO service_role;
ALTER TABLE public.queue_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_select_auth" ON public.queue_agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_admin_write" ON public.queue_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Contacts
CREATE TABLE public.contacts (
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
CREATE POLICY "contacts_all_auth" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Conversations
CREATE TABLE public.conversations (
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
CREATE INDEX conversations_status_idx ON public.conversations(status);
CREATE INDEX conversations_assigned_idx ON public.conversations(assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_all_auth" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction public.message_direction NOT NULL DEFAULT 'outbound',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_all_auth" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Transfers
CREATE TABLE public.transfers (
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
CREATE POLICY "transfers_select_auth" ON public.transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "transfers_insert_auth" ON public.transfers FOR INSERT TO authenticated WITH CHECK (true);

-- Realtime
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Demo data
INSERT INTO public.departments (id, name, description, color) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Comercial', 'Vendas e novos clientes', '#0f766e'),
  ('11111111-1111-1111-1111-111111111102', 'Suporte', 'Atendimento técnico', '#1d4ed8'),
  ('11111111-1111-1111-1111-111111111103', 'Financeiro', 'Cobrança e faturas', '#b45309');

INSERT INTO public.queues (id, name, department_id, greeting, priority) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Vendas', '11111111-1111-1111-1111-111111111101', 'Olá! Bem-vindo ao time comercial.', 1),
  ('22222222-2222-2222-2222-222222222202', 'Suporte N1', '11111111-1111-1111-1111-111111111102', 'Olá! Em que podemos ajudar?', 1),
  ('22222222-2222-2222-2222-222222222203', 'Suporte N2', '11111111-1111-1111-1111-111111111102', 'Você está com o time especializado.', 2),
  ('22222222-2222-2222-2222-222222222204', 'Cobrança', '11111111-1111-1111-1111-111111111103', 'Olá! Setor financeiro falando.', 1);

INSERT INTO public.contacts (id, name, phone) VALUES
  ('33333333-3333-3333-3333-333333333301', 'Ana Ribeiro', '+55 11 98888-1010'),
  ('33333333-3333-3333-3333-333333333302', 'Carlos Menezes', '+55 21 97777-2020'),
  ('33333333-3333-3333-3333-333333333303', 'Juliana Prado', '+55 31 96666-3030'),
  ('33333333-3333-3333-3333-333333333304', 'Rafael Souza', '+55 41 95555-4040'),
  ('33333333-3333-3333-3333-333333333305', 'Mariana Lopes', '+55 51 94444-5050');

INSERT INTO public.conversations (id, contact_id, queue_id, department_id, status, last_message_at, created_at) VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'waiting', now() - interval '5 minutes', now() - interval '20 minutes'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102', 'waiting', now() - interval '12 minutes', now() - interval '40 minutes'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111103', 'waiting', now() - interval '1 hour', now() - interval '2 hours'),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102', 'waiting', now() - interval '3 hours', now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'closed', now() - interval '2 days', now() - interval '2 days');

INSERT INTO public.messages (conversation_id, direction, body, created_at) VALUES
  ('44444444-4444-4444-4444-444444444401', 'inbound', 'Oi, gostaria de saber os planos disponíveis.', now() - interval '20 minutes'),
  ('44444444-4444-4444-4444-444444444401', 'inbound', 'Pode me mandar os valores?', now() - interval '5 minutes'),
  ('44444444-4444-4444-4444-444444444402', 'inbound', 'Meu aplicativo não está abrindo desde ontem.', now() - interval '40 minutes'),
  ('44444444-4444-4444-4444-444444444402', 'inbound', 'Já tentei reinstalar e continua igual.', now() - interval '12 minutes'),
  ('44444444-4444-4444-4444-444444444403', 'inbound', 'Recebi uma fatura em duplicidade este mês.', now() - interval '2 hours'),
  ('44444444-4444-4444-4444-444444444403', 'inbound', 'Podem verificar por favor?', now() - interval '1 hour'),
  ('44444444-4444-4444-4444-444444444404', 'inbound', 'A integração com o sistema parou de sincronizar.', now() - interval '4 hours'),
  ('44444444-4444-4444-4444-444444444405', 'inbound', 'Obrigada pelo atendimento!', now() - interval '2 days');