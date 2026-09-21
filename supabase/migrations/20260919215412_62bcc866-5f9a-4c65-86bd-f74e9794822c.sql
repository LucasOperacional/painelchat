DO $mig$
DECLARE r record; msg text;
BEGIN
  CREATE TABLE IF NOT EXISTS public._import_errors2 (name text, err text);
  DELETE FROM public._import_errors2;
  FOR r IN SELECT name, body FROM public._import_sql2 ORDER BY name LOOP
    BEGIN
      EXECUTE r.body;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      INSERT INTO public._import_errors2 VALUES (r.name, msg);
    END;
  END LOOP;
END
$mig$;
SELECT * FROM public._import_errors2;