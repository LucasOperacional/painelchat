REVOKE EXECUTE ON FUNCTION public.bank_balance() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;