-- 1) Chaves de vínculo deixam de ser legíveis pela API pública/usuários comuns
REVOKE SELECT ON public.projects FROM anon, authenticated;
GRANT SELECT (id, name, slug, is_central, is_active, logo_url, favicon_url, primary_color,
              accent_color, headline, tagline, created_at, updated_at, login_logo_url,
              dashboard_logo_url, chat_background_color, chat_background_url)
  ON public.projects TO anon, authenticated;

REVOKE SELECT ON public.project_domains FROM anon, authenticated;
GRANT SELECT (id, project_id, domain, is_primary, created_at)
  ON public.project_domains TO anon, authenticated;

-- 2) Leituras internas restritas a membros da equipe
DROP POLICY IF EXISTS projects_select_auth ON public.projects;
CREATE POLICY projects_select_team ON public.projects FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS project_domains_select_auth ON public.project_domains;
CREATE POLICY project_domains_select_team ON public.project_domains FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Autenticados podem ver a configuracao de IA" ON public.ai_config;
CREATE POLICY ai_config_select_admin ON public.ai_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS qa_select_auth ON public.queue_agents;
CREATE POLICY qa_select_team ON public.queue_agents FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS chatbots_select_auth ON public.chatbots;
CREATE POLICY chatbots_select_team ON public.chatbots FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS chatbot_options_select_auth ON public.chatbot_options;
CREATE POLICY chatbot_options_select_team ON public.chatbot_options FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS chatbot_sessions_select_auth ON public.chatbot_sessions;
CREATE POLICY chatbot_sessions_select_team ON public.chatbot_sessions FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
