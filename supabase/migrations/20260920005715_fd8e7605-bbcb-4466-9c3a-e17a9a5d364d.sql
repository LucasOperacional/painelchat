REVOKE EXECUTE ON FUNCTION public.bank_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bank_balance() TO service_role;
GRANT EXECUTE ON FUNCTION public.nfse_reservar_rps(uuid) TO service_role;