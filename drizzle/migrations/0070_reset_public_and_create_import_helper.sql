DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;

CREATE OR REPLACE FUNCTION public.__import_exec(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.__import_exec(text) TO sandbox_exec;
GRANT USAGE ON SCHEMA public TO sandbox_exec;