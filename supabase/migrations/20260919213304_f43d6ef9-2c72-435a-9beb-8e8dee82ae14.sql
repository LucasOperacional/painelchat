DO $mig$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_import_sql' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.f);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END
$mig$;

CREATE TABLE IF NOT EXISTS public._import_errors(name text, msg text);
TRUNCATE public._import_errors;

DO $mig$
DECLARE r record;
BEGIN
  FOR r IN SELECT name, body FROM public._import_sql WHERE name NOT IN ('0032_grant_schema_public_to_sandbox_exec.sql','0033_revoke_sandbox_exec_grants.sql') ORDER BY name LOOP
    BEGIN
      EXECUTE r.body;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public._import_errors VALUES (r.name, SQLERRM);
    END;
  END LOOP;
END
$mig$;