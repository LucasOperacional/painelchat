CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  IF NEW.wa_jid IS NOT NULL AND NEW.wa_jid <> '' THEN
    NEW.wa_jid := regexp_replace(split_part(split_part(NEW.wa_jid, '@', 1), ':', 1), '\D', '', 'g')
                  || '@' || COALESCE(NULLIF(split_part(NEW.wa_jid, '@', 2), ''), 's.whatsapp.net');
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_normalize_phone ON public.contacts;
CREATE TRIGGER contacts_normalize_phone
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();