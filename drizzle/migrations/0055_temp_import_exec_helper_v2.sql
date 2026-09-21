CREATE OR REPLACE FUNCTION public.__import_exec(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE sql;
END;
$fn$;
REVOKE ALL ON FUNCTION public.__import_exec(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__import_exec(text) TO sandbox_exec;