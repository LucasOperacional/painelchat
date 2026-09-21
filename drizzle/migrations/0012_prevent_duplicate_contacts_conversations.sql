-- Impede contatos duplicados (mesmo número, com ou sem formatação)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_digits_unique
  ON public.contacts ((regexp_replace(phone, '\D', '', 'g')));

-- Impede o mesmo JID do WhatsApp em mais de um contato
CREATE UNIQUE INDEX IF NOT EXISTS contacts_wa_jid_unique
  ON public.contacts (wa_jid)
  WHERE wa_jid IS NOT NULL;

-- Impede mais de uma conversa ativa (aguardando/em atendimento) por contato
CREATE UNIQUE INDEX IF NOT EXISTS conversations_active_per_contact_unique
  ON public.conversations (contact_id)
  WHERE status <> 'closed';
