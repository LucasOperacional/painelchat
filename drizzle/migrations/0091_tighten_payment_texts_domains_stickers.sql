DROP POLICY IF EXISTS payment_texts_auth ON public.payment_texts;
CREATE POLICY payment_texts_team_read ON public.payment_texts FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY payment_texts_admin_write ON public.payment_texts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS project_domains_public_read ON public.project_domains;
CREATE POLICY project_domains_public_read ON public.project_domains FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_domains.project_id AND p.is_active));

DROP POLICY IF EXISTS "Autenticados gerenciam stickers" ON storage.objects;
CREATE POLICY "Equipe le stickers" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'stickers' AND public.is_team_member(auth.uid()));
CREATE POLICY "Dono gerencia stickers" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'stickers' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin')))
WITH CHECK (bucket_id = 'stickers' AND owner_id = (select auth.uid()::text));