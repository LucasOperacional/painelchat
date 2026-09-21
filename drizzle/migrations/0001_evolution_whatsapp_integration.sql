-- Configuração da integração WhatsApp (Evolution Go)
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT '',
  instance_id text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT 'central',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'disconnected',
  last_qr text,
  last_event text,
  default_queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver a configuracao do WhatsApp" ON public.whatsapp_config;
CREATE POLICY "Admins podem ver a configuracao do WhatsApp"
ON public.whatsapp_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Vínculo com o WhatsApp real
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS wa_jid text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_wa_jid_key ON public.contacts (wa_jid) WHERE wa_jid IS NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;
CREATE INDEX IF NOT EXISTS messages_external_id_idx ON public.messages (external_id);

INSERT INTO public.whatsapp_config (base_url, instance_id)
SELECT '', ''
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_config);
