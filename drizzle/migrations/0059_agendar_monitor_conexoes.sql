-- lovable-cron-fallback-reviewed: detecção de queda das APIs de WhatsApp exige verificação ativa a cada 2 minutos (720 execuções/dia); custo informado ao usuário.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_token text;
BEGIN
  SELECT cron_token INTO v_token FROM public.monitor_settings ORDER BY created_at LIMIT 1;

  PERFORM cron.unschedule('monitor-conexoes-whatsapp')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-conexoes-whatsapp');

  PERFORM cron.schedule(
    'monitor-conexoes-whatsapp',
    '*/2 * * * *',
    format(
      $cmd$select net.http_post(
        url := 'https://project--39b1da47-cdc6-44f9-86c6-8cf9e1e4fbad-dev.lovable.app/api/public/monitor',
        headers := jsonb_build_object('Content-Type','application/json','x-monitor-token',%L),
        body := '{}'::jsonb
      );$cmd$,
      v_token
    )
  );
END
$$;