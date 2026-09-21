CREATE OR REPLACE FUNCTION public.sentinela_limpar_diario()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.webhook_eventos
   WHERE status = 'ok' AND created_at < now() - interval '6 hours';
  DELETE FROM public.webhook_eventos
   WHERE status <> 'ok' AND (tentativas >= 5 OR created_at < now() - interval '2 days');
  DELETE FROM public.sentinela_ciclos WHERE iniciado_em < now() - interval '7 days';
  DELETE FROM public.sentinela_achados WHERE created_at < now() - interval '7 days';
  DELETE FROM public.sentinela_trafego
   WHERE ultimo_em < now() - interval '7 days'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());
$function$;
