-- 1) Chaves de acesso dos projetos deixam de ser legíveis pelo público e por usuários comuns
REVOKE SELECT ON public.projects FROM anon, authenticated;
GRANT SELECT (id, name, slug, is_central, is_active, logo_url, login_logo_url, dashboard_logo_url,
  favicon_url, primary_color, accent_color, chat_background_color, chat_background_url,
  headline, tagline, created_at, updated_at) ON public.projects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

REVOKE SELECT ON public.project_domains FROM anon, authenticated;
GRANT SELECT (id, project_id, domain, is_primary, created_at) ON public.project_domains TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_domains TO authenticated;
GRANT ALL ON public.project_domains TO service_role;

-- 2) Financeiro: apenas administradores (ou quem pediu a transferência)
DROP POLICY IF EXISTS "Equipe pode ver movimentacoes" ON public.bank_transactions;
CREATE POLICY bank_transactions_select_admin ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR requested_by = auth.uid());

-- 3) Cobranças PIX: admin ou o atendente da conversa
DROP POLICY IF EXISTS pix_charges_select_authenticated ON public.pix_charges;
CREATE POLICY pix_charges_select_scoped ON public.pix_charges
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = pix_charges.conversation_id AND c.assigned_to = auth.uid()
    )
  );

-- 4) Transferências: admin ou quem enviou/recebeu
DROP POLICY IF EXISTS transfers_select_auth ON public.transfers;
CREATE POLICY transfers_select_scoped ON public.transfers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR from_user = auth.uid()
    OR to_user = auth.uid()
  );

-- 5) Dados contábeis e fiscais: apenas administradores
DROP POLICY IF EXISTS mei_clients_all_auth ON public.mei_clients;
CREATE POLICY mei_clients_admin ON public.mei_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS mei_das_all_auth ON public.mei_das;
CREATE POLICY mei_das_admin ON public.mei_das
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS nfse_config_select ON public.nfse_config;
CREATE POLICY nfse_config_select_admin ON public.nfse_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS nfse_notas_select ON public.nfse_notas;
CREATE POLICY nfse_notas_select_scoped ON public.nfse_notas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

DROP POLICY IF EXISTS nfse_eventos_select ON public.nfse_eventos;
CREATE POLICY nfse_eventos_select_admin ON public.nfse_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));