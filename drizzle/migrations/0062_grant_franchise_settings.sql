GRANT SELECT, INSERT, UPDATE ON public.franchise_settings TO authenticated;
GRANT ALL ON public.franchise_settings TO service_role;

DROP POLICY IF EXISTS "Admin insere franquia" ON public.franchise_settings;
CREATE POLICY "Admin insere franquia" ON public.franchise_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin atualiza franquia" ON public.franchise_settings;
CREATE POLICY "Admin atualiza franquia" ON public.franchise_settings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));