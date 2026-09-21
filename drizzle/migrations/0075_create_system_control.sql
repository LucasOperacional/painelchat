CREATE TABLE IF NOT EXISTS public.system_control (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  admin_phone text NOT NULL DEFAULT '5562910002123',
  state text NOT NULL DEFAULT 'ligado' CHECK (state IN ('ligado','desligado','bloqueado')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_control TO authenticated;
GRANT UPDATE ON public.system_control TO authenticated;
GRANT ALL ON public.system_control TO service_role;

ALTER TABLE public.system_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipe le o controle do sistema" ON public.system_control;
CREATE POLICY "equipe le o controle do sistema"
ON public.system_control FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "admin altera o controle do sistema" ON public.system_control;
CREATE POLICY "admin altera o controle do sistema"
ON public.system_control FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.system_control (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;