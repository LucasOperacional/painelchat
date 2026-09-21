ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  whatsapp_config_id UUID NOT NULL REFERENCES public.whatsapp_config(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, whatsapp_config_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_connections TO authenticated;
GRANT ALL ON public.agent_connections TO service_role;

ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read agent_connections" ON public.agent_connections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage agent_connections" ON public.agent_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));