-- Helper: only provisioned staff (users with a role row) are "team members"
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;

-- Conversations / messages / contacts: staff only (was: any authenticated user)
DROP POLICY IF EXISTS conv_all_auth ON public.conversations;
CREATE POLICY conv_team_all ON public.conversations FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS msg_all_auth ON public.messages;
CREATE POLICY msg_team_all ON public.messages FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS contacts_all_auth ON public.contacts;
CREATE POLICY contacts_team_all ON public.contacts FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));

-- Billing: staff read/create, only admins may delete or rewrite schedules
DROP POLICY IF EXISTS "Equipe gerencia cobrancas" ON public.cobrancas;
CREATE POLICY cobrancas_team_select ON public.cobrancas FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
CREATE POLICY cobrancas_team_insert ON public.cobrancas FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY cobrancas_team_update ON public.cobrancas FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY cobrancas_admin_delete ON public.cobrancas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Equipe le historico de cobrancas" ON public.cobranca_envios;
CREATE POLICY cobranca_envios_team_select ON public.cobranca_envios FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

-- Transfers: cannot forge someone else's identity
DROP POLICY IF EXISTS transfers_insert_auth ON public.transfers;
CREATE POLICY transfers_insert_self ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid())
              AND (from_user = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- Staff directory: staff only
DROP POLICY IF EXISTS profiles_select_auth ON public.profiles;
CREATE POLICY profiles_select_team ON public.profiles FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) OR id = auth.uid());

-- Role assignments: own row or admin (no privilege reconnaissance)
DROP POLICY IF EXISTS roles_select_auth ON public.user_roles;
CREATE POLICY roles_select_self_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Shared lookups: staff only
DROP POLICY IF EXISTS queues_select_auth ON public.queues;
CREATE POLICY queues_select_team ON public.queues FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS dept_select_auth ON public.departments;
CREATE POLICY dept_select_team ON public.departments FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "authenticated read agent_connections" ON public.agent_connections;
CREATE POLICY agent_connections_select_team ON public.agent_connections FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
