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