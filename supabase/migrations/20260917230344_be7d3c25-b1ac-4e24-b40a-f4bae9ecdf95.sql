ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DROP POLICY IF EXISTS "Autenticados enviam anexos" ON storage.objects;
CREATE POLICY "Autenticados enviam anexos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos');
DROP POLICY IF EXISTS "Autenticados leem anexos" ON storage.objects;
CREATE POLICY "Autenticados leem anexos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos');
DROP POLICY IF EXISTS "Autenticados apagam anexos" ON storage.objects;
CREATE POLICY "Autenticados apagam anexos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'anexos');

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