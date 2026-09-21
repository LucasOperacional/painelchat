CREATE TABLE public.ai_config (
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

CREATE POLICY "Autenticados podem ver a configuracao de IA"
ON public.ai_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gerenciam a configuracao de IA"
ON public.ai_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_config (provider, model) VALUES ('gemini', 'gemini-2.5-flash');