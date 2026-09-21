DO $fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_id_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_user_id_fkey') THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stickers_user_id_fkey') THEN
    ALTER TABLE public.stickers ADD CONSTRAINT stickers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfse_notas_user_id_fkey') THEN
    ALTER TABLE public.nfse_notas ADD CONSTRAINT nfse_notas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='consultas_historico_user_id_fkey') THEN
    ALTER TABLE public.consultas_historico ADD CONSTRAINT consultas_historico_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $fk$;

DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; END IF; END $do$;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='transfers') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.transfers; END IF; END $do$;

DROP POLICY IF EXISTS "webviews_admin_write" ON public.webviews;
CREATE POLICY "webviews_admin_write" ON public.webviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS das_mei_select_own ON public.das_mei_documentos;
CREATE POLICY das_mei_select_own ON public.das_mei_documentos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS das_mei_insert_own ON public.das_mei_documentos;
CREATE POLICY das_mei_insert_own ON public.das_mei_documentos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS das_mei_update_own ON public.das_mei_documentos;
CREATE POLICY das_mei_update_own ON public.das_mei_documentos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS das_mei_delete_own ON public.das_mei_documentos;
CREATE POLICY das_mei_delete_own ON public.das_mei_documentos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS stickers_select ON public.stickers;
CREATE POLICY stickers_select ON public.stickers
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS stickers_insert_own ON public.stickers;
CREATE POLICY stickers_insert_own ON public.stickers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS stickers_update_own ON public.stickers;
CREATE POLICY stickers_update_own ON public.stickers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS stickers_delete_own ON public.stickers;
CREATE POLICY stickers_delete_own ON public.stickers
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS nfse_notas_select ON public.nfse_notas;
CREATE POLICY nfse_notas_select ON public.nfse_notas FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS nfse_eventos_select ON public.nfse_eventos;
CREATE POLICY nfse_eventos_select ON public.nfse_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.nfse_notas n WHERE n.id = nfse_eventos.nfse_id
    AND (n.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "roles_admin_write" ON public.user_roles;
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "dept_admin_write" ON public.departments;
CREATE POLICY "dept_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "queues_admin_write" ON public.queues;
CREATE POLICY "queues_admin_write" ON public.queues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "qa_admin_write" ON public.queue_agents;
CREATE POLICY "qa_admin_write" ON public.queue_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins podem ver a configuracao do WhatsApp" ON public.whatsapp_config;
CREATE POLICY "Admins podem ver a configuracao do WhatsApp"
ON public.whatsapp_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins gerenciam a configuracao de IA" ON public.ai_config;
CREATE POLICY "Admins gerenciam a configuracao de IA"
ON public.ai_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS projects_admin_write ON public.projects;
CREATE POLICY projects_admin_write ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS project_domains_admin_write ON public.project_domains;
CREATE POLICY project_domains_admin_write ON public.project_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "chatbots_admin_write" ON public.chatbots;
CREATE POLICY "chatbots_admin_write" ON public.chatbots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "chatbot_options_admin_write" ON public.chatbot_options;
CREATE POLICY "chatbot_options_admin_write" ON public.chatbot_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins gerenciam divulgacoes" ON public.broadcast_campaigns;
CREATE POLICY "Admins gerenciam divulgacoes" ON public.broadcast_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins veem envios" ON public.broadcast_runs;
CREATE POLICY "Admins veem envios" ON public.broadcast_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins gerenciam menus de botao" ON public.button_menus;
CREATE POLICY "Admins gerenciam menus de botao"
  ON public.button_menus FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Autenticados enviam anexos" ON storage.objects;
CREATE POLICY "Autenticados enviam anexos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos');
DROP POLICY IF EXISTS "Autenticados leem anexos" ON storage.objects;
CREATE POLICY "Autenticados leem anexos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos');
DROP POLICY IF EXISTS "Autenticados apagam anexos" ON storage.objects;
CREATE POLICY "Autenticados apagam anexos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'anexos');
DROP POLICY IF EXISTS "Autenticados gerenciam stickers" ON storage.objects;
CREATE POLICY "Autenticados gerenciam stickers" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'stickers') WITH CHECK (bucket_id = 'stickers');
DROP POLICY IF EXISTS das_mei_storage_select ON storage.objects;
CREATE POLICY das_mei_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'das-mei' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS das_mei_storage_insert ON storage.objects;
CREATE POLICY das_mei_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'das-mei' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS das_mei_storage_update ON storage.objects;
CREATE POLICY das_mei_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'das-mei' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS das_mei_storage_delete ON storage.objects;
CREATE POLICY das_mei_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'das-mei' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS "admins manage agent_connections" ON public.agent_connections;
CREATE POLICY "admins manage agent_connections" ON public.agent_connections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS bank_transactions_select_admin ON public.bank_transactions;
CREATE POLICY bank_transactions_select_admin ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR requested_by = auth.uid());
DROP POLICY IF EXISTS pix_charges_select_scoped ON public.pix_charges;
CREATE POLICY pix_charges_select_scoped ON public.pix_charges
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = pix_charges.conversation_id AND c.assigned_to = auth.uid()
    )
  );
DROP POLICY IF EXISTS transfers_select_scoped ON public.transfers;
CREATE POLICY transfers_select_scoped ON public.transfers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR from_user = auth.uid()
    OR to_user = auth.uid()
  );
DROP POLICY IF EXISTS mei_clients_admin ON public.mei_clients;
CREATE POLICY mei_clients_admin ON public.mei_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS mei_das_admin ON public.mei_das;
CREATE POLICY mei_das_admin ON public.mei_das
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS nfse_config_select_admin ON public.nfse_config;
CREATE POLICY nfse_config_select_admin ON public.nfse_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS nfse_notas_select_scoped ON public.nfse_notas;
CREATE POLICY nfse_notas_select_scoped ON public.nfse_notas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
DROP POLICY IF EXISTS nfse_eventos_select_admin ON public.nfse_eventos;
CREATE POLICY nfse_eventos_select_admin ON public.nfse_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "consultas historico leitura propria ou admin" ON public.consultas_historico;
CREATE POLICY "consultas historico leitura propria ou admin"
ON public.consultas_historico
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins gerenciam acessos" ON public.cobranca_acessos;
CREATE POLICY "Admins gerenciam acessos" ON public.cobranca_acessos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS conv_team_all ON public.conversations;
CREATE POLICY conv_team_all ON public.conversations FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS msg_team_all ON public.messages;
CREATE POLICY msg_team_all ON public.messages FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS contacts_team_all ON public.contacts;
CREATE POLICY contacts_team_all ON public.contacts FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS cobrancas_team_select ON public.cobrancas;
CREATE POLICY cobrancas_team_select ON public.cobrancas FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS cobrancas_team_insert ON public.cobrancas;
CREATE POLICY cobrancas_team_insert ON public.cobrancas FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS cobrancas_team_update ON public.cobrancas;
CREATE POLICY cobrancas_team_update ON public.cobrancas FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS cobrancas_admin_delete ON public.cobrancas;
CREATE POLICY cobrancas_admin_delete ON public.cobrancas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS cobranca_envios_team_select ON public.cobranca_envios;
CREATE POLICY cobranca_envios_team_select ON public.cobranca_envios FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS transfers_insert_self ON public.transfers;
CREATE POLICY transfers_insert_self ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid())
              AND (from_user = auth.uid() OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS profiles_select_team ON public.profiles;
CREATE POLICY profiles_select_team ON public.profiles FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) OR id = auth.uid());
DROP POLICY IF EXISTS roles_select_self_or_admin ON public.user_roles;
CREATE POLICY roles_select_self_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS queues_select_team ON public.queues;
CREATE POLICY queues_select_team ON public.queues FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS dept_select_team ON public.departments;
CREATE POLICY dept_select_team ON public.departments FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS agent_connections_select_team ON public.agent_connections;
CREATE POLICY agent_connections_select_team ON public.agent_connections FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS projects_select_team ON public.projects;
CREATE POLICY projects_select_team ON public.projects FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS project_domains_select_team ON public.project_domains;
CREATE POLICY project_domains_select_team ON public.project_domains FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS ai_config_select_admin ON public.ai_config;
CREATE POLICY ai_config_select_admin ON public.ai_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS qa_select_team ON public.queue_agents;
CREATE POLICY qa_select_team ON public.queue_agents FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS chatbots_select_team ON public.chatbots;
CREATE POLICY chatbots_select_team ON public.chatbots FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS chatbot_options_select_team ON public.chatbot_options;
CREATE POLICY chatbot_options_select_team ON public.chatbot_options FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
DROP POLICY IF EXISTS chatbot_sessions_select_team ON public.chatbot_sessions;
CREATE POLICY chatbot_sessions_select_team ON public.chatbot_sessions FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()));
