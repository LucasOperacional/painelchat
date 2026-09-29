-- A limpeza diária apagava do diário TODO evento que esgotou as tentativas
-- (tentativas >= 5) ou que tinha mais de 3 dias, mesmo sem ter sido processado.
-- Ou seja: a mensagem que mais precisava de atenção era justamente a que
-- desaparecia primeiro, sem janela para recuperar à mão.
--
-- Agora o evento que falhou é guardado por 30 dias. Ele continua fora da fila
-- automática (a fila filtra por tentativas < 5), então isto não reprocessa nada
-- sozinho: só garante que a mensagem possa ser recuperada pela tela de
-- pendentes em vez de ser perdida para sempre.

CREATE OR REPLACE FUNCTION public.sentinela_limpar_diario()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Processado com sucesso: não precisa mais ser guardado.
  DELETE FROM public.webhook_eventos
   WHERE status = 'ok' AND created_at < now() - interval '2 days';
  -- Falhou ou ficou pendente: 30 dias para dar tempo de recuperar a mensagem.
  DELETE FROM public.webhook_eventos
   WHERE status <> 'ok' AND created_at < now() - interval '30 days';
  DELETE FROM public.sentinela_ciclos WHERE iniciado_em < now() - interval '7 days';
  DELETE FROM public.sentinela_achados WHERE created_at < now() - interval '7 days';
  DELETE FROM public.sentinela_trafego
   WHERE ultimo_em < now() - interval '7 days'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());
$function$;

-- A fila busca por status e idade; sem o índice a varredura crescia junto com a
-- retenção mais longa.
CREATE INDEX IF NOT EXISTS webhook_eventos_fila_tentativas_idx
  ON public.webhook_eventos (created_at)
  WHERE status <> 'ok' AND tentativas < 5;
