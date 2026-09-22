CREATE TABLE public.stories_recebidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  config_id uuid REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'status',
  chat_jid text NOT NULL DEFAULT '',
  autor_jid text NOT NULL DEFAULT '',
  autor_nome text NOT NULL DEFAULT '',
  texto text NOT NULL DEFAULT '',
  midia_url text NOT NULL DEFAULT '',
  midia_tipo text NOT NULL DEFAULT 'nenhum',
  wa_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stories_recebidos TO authenticated;
GRANT ALL ON public.stories_recebidos TO service_role;

ALTER TABLE public.stories_recebidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe ve stories do proprio projeto"
ON public.stories_recebidos
FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid()) AND (project_id IS NULL OR project_id = public.current_project_id()));

CREATE UNIQUE INDEX stories_recebidos_wa_id_idx ON public.stories_recebidos (wa_id) WHERE wa_id <> '';
CREATE INDEX stories_recebidos_created_idx ON public.stories_recebidos (created_at DESC);