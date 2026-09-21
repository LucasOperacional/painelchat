REVOKE EXECUTE ON FUNCTION public.bank_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_balance() TO authenticated, service_role;