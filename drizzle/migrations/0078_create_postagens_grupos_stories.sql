CREATE TABLE IF NOT EXISTS public.postagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT 'Nova postagem',
  device_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  destino text NOT NULL DEFAULT 'todos_grupos',
  grupos text[] NOT NULL DEFAULT '{}',
  mensagem text NOT NULL DEFAULT '',
  midia_url text NOT NULL DEFAULT '',
  midia_tipo text NOT NULL DEFAULT 'nenhum',
  delay_segundos integer NOT NULL DEFAULT 8,
  frequencia text NOT NULL DEFAULT 'unica',
  intervalo_horas integer NOT NULL DEFAULT 24,
  dias_semana integer[] NOT NULL DEFAULT '{}',
  inicio_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pendente',
  proximo_em timestamptz,
  ultimo_em timestamptz,
  ultimo_status text NOT NULL DEFAULT '',
  total_enviados integer NOT NULL DEFAULT 0,
  total_falhas integer NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT postagens_destino_check CHECK (destino IN ('grupos', 'todos_grupos', 'status', 'status_grupos')),
  CONSTRAINT postagens_midia_check CHECK (midia_tipo IN ('nenhum', 'imagem', 'video')),
  CONSTRAINT postagens_frequencia_check CHECK (frequencia IN ('unica', 'horas', 'diaria', 'dias_semana', 'semanal')),
  CONSTRAINT postagens_status_check CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'falha', 'recorrente'))
);

CREATE TABLE IF NOT EXISTS public.postagem_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postagem_id uuid NOT NULL REFERENCES public.postagens(id) ON DELETE CASCADE,
  destino text NOT NULL DEFAULT '',
  destino_nome text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'grupo',
  ok boolean NOT NULL DEFAULT false,
  detalhe text NOT NULL DEFAULT '',
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.postagens_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cron_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.postagens_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS postagens_due_idx ON public.postagens (ativo, proximo_em);
CREATE INDEX IF NOT EXISTS postagem_envios_postagem_idx ON public.postagem_envios (postagem_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.postagens TO authenticated;
GRANT ALL ON public.postagens TO service_role;
GRANT SELECT ON public.postagem_envios TO authenticated;
GRANT ALL ON public.postagem_envios TO service_role;
GRANT ALL ON public.postagens_settings TO service_role;

ALTER TABLE public.postagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postagem_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postagens_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam postagens" ON public.postagens;
CREATE POLICY "Admins gerenciam postagens" ON public.postagens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "Admins veem envios de postagens" ON public.postagem_envios;
CREATE POLICY "Admins veem envios de postagens" ON public.postagem_envios
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));