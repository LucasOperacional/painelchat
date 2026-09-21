-- Nenhuma função interna deve ser chamável por visitantes não autenticados.
REVOKE EXECUTE ON FUNCTION public.bank_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_project_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) FROM anon;

-- Funções de gatilho não devem ser chamáveis pela API em nenhuma hipótese.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bank_touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_conversa() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_mensagem() FROM anon, authenticated;

-- Reservar emissão de NFS-e é operação administrativa.
REVOKE EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) FROM authenticated;

-- Índices que evitam travamento nas varreduras da vigilância.
CREATE INDEX IF NOT EXISTS webhook_eventos_status_idx ON public.webhook_eventos (status, created_at);
CREATE INDEX IF NOT EXISTS sentinela_trafego_ip_idx ON public.sentinela_trafego (ip);
CREATE INDEX IF NOT EXISTS sentinela_achados_status_idx ON public.sentinela_achados (status, created_at DESC);

-- Limpeza automática do diário de eventos: mantém 7 dias, evita crescimento sem fim.
CREATE OR REPLACE FUNCTION public.sentinela_limpar_diario()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.webhook_eventos
   WHERE status = 'ok' AND created_at < now() - interval '7 days';
  DELETE FROM public.sentinela_ciclos WHERE iniciado_em < now() - interval '30 days';
  DELETE FROM public.sentinela_trafego
   WHERE ultimo_em < now() - interval '7 days'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());
$$;
REVOKE EXECUTE ON FUNCTION public.sentinela_limpar_diario() FROM anon, authenticated;