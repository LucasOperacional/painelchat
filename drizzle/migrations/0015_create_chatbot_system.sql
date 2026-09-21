CREATE TYPE public.chatbot_action AS ENUM ('message', 'transfer_queue', 'transfer_department', 'ai', 'close');
CREATE TYPE public.chatbot_state AS ENUM ('menu', 'ai', 'handoff', 'done');

CREATE TABLE public.chatbots (
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
CREATE POLICY "chatbots_select_auth" ON public.chatbots FOR SELECT TO authenticated USING (true);
CREATE POLICY "chatbots_admin_write" ON public.chatbots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.chatbot_options (
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
CREATE POLICY "chatbot_options_select_auth" ON public.chatbot_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "chatbot_options_admin_write" ON public.chatbot_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.chatbot_sessions (
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
CREATE POLICY "chatbot_sessions_select_auth" ON public.chatbot_sessions FOR SELECT TO authenticated USING (true);

INSERT INTO public.chatbots (id, name, is_active) VALUES
  ('44444444-4444-4444-4444-444444444401', 'Atendimento automático', false);

INSERT INTO public.chatbot_options (chatbot_id, option_key, label, response, action, queue_id, department_id, sort_order)
SELECT '44444444-4444-4444-4444-444444444401', '1', 'Falar com um atendente', 'Perfeito! Encaminhando para um atendente.', 'transfer_queue'::public.chatbot_action,
       q.id, q.department_id, 1
FROM public.queues q WHERE q.is_active ORDER BY q.priority LIMIT 1;

INSERT INTO public.chatbot_options (chatbot_id, option_key, label, response, action, sort_order) VALUES
  ('44444444-4444-4444-4444-444444444401', '2', 'Tirar uma dúvida com o assistente', 'Claro! Pode escrever sua dúvida que eu respondo.', 'ai', 2),
  ('44444444-4444-4444-4444-444444444401', '3', 'Encerrar o atendimento', 'Obrigado pelo contato! Atendimento encerrado.', 'close', 3);