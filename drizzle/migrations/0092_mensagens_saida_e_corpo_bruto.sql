ALTER TABLE public.webhook_eventos ADD COLUMN IF NOT EXISTS corpo_bruto text, ADD COLUMN IF NOT EXISTS corpo_path text, ADD COLUMN IF NOT EXISTS content_type text;

CREATE TABLE IF NOT EXISTS public.mensagens_saida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  config_id uuid,
  sender_id uuid,
  destino text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'texto',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  external_id text,
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);
GRANT ALL ON public.mensagens_saida TO service_role;
ALTER TABLE public.mensagens_saida ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mensagens_saida_status_created_idx ON public.mensagens_saida (status, created_at DESC);