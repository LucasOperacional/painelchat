CREATE TABLE IF NOT EXISTS public.otimizacao_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  intervalo_horas INTEGER NOT NULL DEFAULT 6,
  retencao_eventos_horas INTEGER NOT NULL DEFAULT 6,
  retencao_logs_dias INTEGER NOT NULL DEFAULT 7,
  retencao_mensagens_dias INTEGER NOT NULL DEFAULT 0,
  limpar_anexos_orfaos BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_execucao TIMESTAMPTZ,
  ultimo_relatorio JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.otimizacao_settings TO authenticated;
GRANT ALL ON public.otimizacao_settings TO service_role;

ALTER TABLE public.otimizacao_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins leem otimizacao" ON public.otimizacao_settings;
CREATE POLICY "admins leem otimizacao"
ON public.otimizacao_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.otimizacao_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.otimizar_servidor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.otimizacao_settings;
  v_antes BIGINT;
  v_depois BIGINT;
  v_eventos INTEGER := 0;
  v_ciclos INTEGER := 0;
  v_achados INTEGER := 0;
  v_trafego INTEGER := 0;
  v_mensagens INTEGER := 0;
  v_rel JSONB;
BEGIN
  INSERT INTO public.otimizacao_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO cfg FROM public.otimizacao_settings WHERE id;

  SELECT pg_database_size(current_database()) INTO v_antes;

  DELETE FROM public.webhook_eventos
   WHERE created_at < now() - make_interval(hours => GREATEST(cfg.retencao_eventos_horas, 1));
  GET DIAGNOSTICS v_eventos = ROW_COUNT;

  DELETE FROM public.sentinela_ciclos
   WHERE iniciado_em < now() - make_interval(days => GREATEST(cfg.retencao_logs_dias, 1));
  GET DIAGNOSTICS v_ciclos = ROW_COUNT;

  DELETE FROM public.sentinela_achados
   WHERE created_at < now() - make_interval(days => GREATEST(cfg.retencao_logs_dias, 1));
  GET DIAGNOSTICS v_achados = ROW_COUNT;

  DELETE FROM public.sentinela_trafego
   WHERE ultimo_em < now() - make_interval(days => GREATEST(cfg.retencao_logs_dias, 1))
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());
  GET DIAGNOSTICS v_trafego = ROW_COUNT;

  IF COALESCE(cfg.retencao_mensagens_dias, 0) > 0 THEN
    DELETE FROM public.messages
     WHERE created_at < now() - make_interval(days => cfg.retencao_mensagens_dias);
    GET DIAGNOSTICS v_mensagens = ROW_COUNT;
  END IF;

  ANALYZE public.messages;
  ANALYZE public.conversations;
  ANALYZE public.webhook_eventos;

  SELECT pg_database_size(current_database()) INTO v_depois;

  v_rel := jsonb_build_object(
    'executado_em', now(),
    'tamanho_antes', v_antes,
    'tamanho_depois', v_depois,
    'liberado', GREATEST(v_antes - v_depois, 0),
    'eventos_removidos', v_eventos,
    'ciclos_removidos', v_ciclos,
    'achados_removidos', v_achados,
    'trafego_removido', v_trafego,
    'mensagens_removidas', v_mensagens
  );

  UPDATE public.otimizacao_settings
     SET ultima_execucao = now(), ultimo_relatorio = v_rel, updated_at = now()
   WHERE id;

  RETURN v_rel;
END;
$$;

REVOKE ALL ON FUNCTION public.otimizar_servidor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.otimizar_servidor() TO service_role;

CREATE OR REPLACE FUNCTION public.otimizacao_status()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tamanho_banco', pg_database_size(current_database()),
    'eventos', (SELECT count(*) FROM public.webhook_eventos),
    'mensagens', (SELECT count(*) FROM public.messages),
    'ciclos', (SELECT count(*) FROM public.sentinela_ciclos),
    'achados', (SELECT count(*) FROM public.sentinela_achados)
  );
$$;

REVOKE ALL ON FUNCTION public.otimizacao_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.otimizacao_status() TO service_role;