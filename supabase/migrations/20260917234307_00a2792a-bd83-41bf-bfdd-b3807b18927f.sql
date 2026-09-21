DELETE FROM public.messages m
USING public.conversations c, public.contacts ct
WHERE m.conversation_id = c.id
  AND c.contact_id = ct.id
  AND ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');

DELETE FROM public.chatbot_sessions s
USING public.conversations c, public.contacts ct
WHERE s.conversation_id = c.id
  AND c.contact_id = ct.id
  AND ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');

DELETE FROM public.transfers t
USING public.conversations c, public.contacts ct
WHERE t.conversation_id = c.id
  AND c.contact_id = ct.id
  AND ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');

DELETE FROM public.pix_charges p
USING public.conversations c, public.contacts ct
WHERE p.conversation_id = c.id
  AND c.contact_id = ct.id
  AND ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');

DELETE FROM public.conversations c
USING public.contacts ct
WHERE c.contact_id = ct.id
  AND ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');

DELETE FROM public.contacts ct
WHERE ct.wa_jid LIKE '%@g.us'
  AND (ct.name ~ '^[0-9 .:+()-]+$' OR ct.name ~* '^grupo[ 0-9]*$');