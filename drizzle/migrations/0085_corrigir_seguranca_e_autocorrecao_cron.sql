-- 1. Leitura restrita a membros da equipe (antes: qualquer usuário autenticado)
DROP POLICY IF EXISTS "Autenticados leem franquia" ON public.franchise_settings;
CREATE POLICY "Equipe le franquia" ON public.franchise_settings
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "inbound settings readable" ON public.inbound_settings;
CREATE POLICY "Equipe le inbound settings" ON public.inbound_settings
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "webviews_select_auth" ON public.webviews;
CREATE POLICY "webviews_select_team" ON public.webviews
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) AND project_id = public.current_project_id());

DROP POLICY IF EXISTS "Atendentes leem menus de botao" ON public.button_menus;
CREATE POLICY "Equipe le menus de botao" ON public.button_menus
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) AND project_id = public.current_project_id());

-- 2. Autocorreção do agendador: mantém as rotinas apontando para o endereço atual
CREATE OR REPLACE FUNCTION public.cron_corrigir_urls(_base text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_novo text;
  v_corrigidos integer := 0;
  v_host text := regexp_replace(_base, '/+$', '');
BEGIN
  IF v_host IS NULL OR v_host = '' THEN RETURN 0; END IF;
  FOR r IN SELECT jobid, command FROM cron.job WHERE command LIKE '%/api/public/%' LOOP
    v_novo := regexp_replace(r.command, 'https?://[^/'']+(/api/public/)', v_host || '\1', 'g');
    IF v_novo IS DISTINCT FROM r.command THEN
      PERFORM cron.alter_job(r.jobid, command := v_novo);
      v_corrigidos := v_corrigidos + 1;
    END IF;
  END LOOP;
  RETURN v_corrigidos;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_corrigir_urls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_corrigir_urls(text) TO service_role;

-- 3. Fila travada: eventos sem conteúdo útil saem da fila; mensagens voltam a ser reprocessadas
UPDATE public.webhook_eventos
   SET status = 'ok', processado_em = now(), erro = 'Evento sem conteúdo de mensagem.'
 WHERE status = 'processando'
   AND created_at < now() - interval '15 minutes'
   AND lower(coalesce(evento,'')) IN ('pushname','receipt','chatpresence','presence','historysync','groupinfo');

UPDATE public.webhook_eventos
   SET tentativas = 0
 WHERE status = 'processando'
   AND created_at < now() - interval '15 minutes';