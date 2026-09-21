CREATE TABLE public.das_mei_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nome_original TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  competencia TEXT NOT NULL DEFAULT '',
  data_vencimento DATE,
  valor NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pendente',
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX das_mei_documentos_user_idx ON public.das_mei_documentos (user_id, criado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.das_mei_documentos TO authenticated;
GRANT ALL ON public.das_mei_documentos TO service_role;

ALTER TABLE public.das_mei_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY das_mei_select_own ON public.das_mei_documentos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY das_mei_insert_own ON public.das_mei_documentos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY das_mei_update_own ON public.das_mei_documentos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY das_mei_delete_own ON public.das_mei_documentos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY das_mei_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'das-mei'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY das_mei_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'das-mei'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY das_mei_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'das-mei'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY das_mei_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'das-mei'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );