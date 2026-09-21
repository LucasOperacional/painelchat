-- 1. Tighten is_team_member to explicit staff roles
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  )
$$;

-- 2. Revoke EXECUTE on SECURITY DEFINER / internal functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bank_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_contact_phone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bank_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nfse_reservar_rps(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bank_balance() TO service_role;
GRANT EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) TO service_role;

-- 3. cobranca_envios: explicit admin-only writes, service role keeps full access
CREATE POLICY cobranca_envios_admin_insert ON public.cobranca_envios
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY cobranca_envios_admin_update ON public.cobranca_envios
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY cobranca_envios_admin_delete ON public.cobranca_envios
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Secrets tables: remove client-role privileges entirely (server-side only)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_secrets','altispay_secrets','cloudflare_secrets','consultas_secrets','divulgazap_secrets','efi_secrets','misticpay_secrets','nfse_secrets','wavoip_secrets','whatsapp_secrets','broadcast_settings','cobranca_settings']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- 5. Storage: anexos scoped to staff, personal sticker folders owner-only
DROP POLICY IF EXISTS "Autenticados enviam anexos" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados leem anexos" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados apagam anexos" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados gerenciam stickers" ON storage.objects;

CREATE POLICY anexos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos' AND public.is_team_member(auth.uid()));
CREATE POLICY anexos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'anexos' AND public.is_team_member(auth.uid())
    AND ((storage.foldername(name))[1] <> 'figurinhas'
         OR (storage.foldername(name))[2] = (auth.uid())::text)
  );
CREATE POLICY anexos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'anexos' AND public.is_team_member(auth.uid())
    AND ((storage.foldername(name))[1] <> 'figurinhas'
         OR (storage.foldername(name))[2] = (auth.uid())::text
         OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
CREATE POLICY anexos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'anexos' AND public.is_team_member(auth.uid())
    AND ((storage.foldername(name))[1] <> 'figurinhas'
         OR (storage.foldername(name))[2] = (auth.uid())::text
         OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

CREATE POLICY stickers_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stickers' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY stickers_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stickers' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY stickers_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'stickers' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY stickers_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stickers' AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.has_role(auth.uid(), 'admin'::public.app_role)));