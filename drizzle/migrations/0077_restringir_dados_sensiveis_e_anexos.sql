-- 1) Credenciais de franquia e chaves de acesso deixam de ser legíveis pela API pública.
REVOKE SELECT ON public.projects FROM anon, authenticated;
GRANT SELECT (
  id, name, slug, is_central, is_active, logo_url, favicon_url,
  primary_color, accent_color, headline, tagline, created_at, updated_at,
  login_logo_url, dashboard_logo_url, chat_background_color, chat_background_url
) ON public.projects TO anon, authenticated;

REVOKE SELECT ON public.project_domains FROM anon, authenticated;
GRANT SELECT (id, project_id, domain, is_primary, created_at) ON public.project_domains TO anon, authenticated;

-- 2) Anexos: cada franquia só alcança os arquivos das suas próprias conversas.
CREATE OR REPLACE FUNCTION public.anexo_do_meu_projeto(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := split_part(COALESCE(_name, ''), '/', 1);
  v_conv uuid;
  v_project uuid;
BEGIN
  IF v_first !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN TRUE;
  END IF;
  v_conv := v_first::uuid;
  SELECT project_id INTO v_project FROM public.conversations WHERE id = v_conv;
  IF v_project IS NULL THEN
    RETURN TRUE;
  END IF;
  RETURN v_project = public.current_project_id();
END;
$$;

REVOKE ALL ON FUNCTION public.anexo_do_meu_projeto(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.anexo_do_meu_projeto(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Autenticados leem anexos" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados enviam anexos" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados apagam anexos" ON storage.objects;

CREATE POLICY "Equipe le anexos do proprio projeto"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'anexos'
  AND public.is_team_member(auth.uid())
  AND public.anexo_do_meu_projeto(name)
);

CREATE POLICY "Equipe envia anexos do proprio projeto"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'anexos'
  AND public.is_team_member(auth.uid())
  AND public.anexo_do_meu_projeto(name)
);

CREATE POLICY "Equipe apaga anexos do proprio projeto"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'anexos'
  AND public.is_team_member(auth.uid())
  AND public.anexo_do_meu_projeto(name)
);