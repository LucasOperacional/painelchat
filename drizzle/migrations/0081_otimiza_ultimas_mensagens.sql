-- Índice para ordenar a lista de conversas sem varrer a tabela
CREATE INDEX IF NOT EXISTS conversations_project_last_msg_idx
  ON public.conversations (project_id, last_message_at DESC);

-- Índice para buscar a última mensagem de cada conversa
CREATE INDEX IF NOT EXISTS messages_conversation_created_desc_idx
  ON public.messages (conversation_id, created_at DESC);

-- Última mensagem por conversa em uma única passada (respeita RLS: security invoker)
CREATE OR REPLACE FUNCTION public.ultimas_mensagens(_ids uuid[])
RETURNS TABLE(id uuid, conversation_id uuid, body text, direction message_direction, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.conversation_id)
         m.id, m.conversation_id, m.body, m.direction, m.created_at
    FROM public.messages m
   WHERE m.conversation_id = ANY(_ids)
   ORDER BY m.conversation_id, m.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.ultimas_mensagens(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ultimas_mensagens(uuid[]) TO service_role;
