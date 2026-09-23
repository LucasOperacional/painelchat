SET lock_timeout = '20s';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS sem_conexao boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.marcar_conversas_sem_conexao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET sem_conexao = true WHERE whatsapp_config_id = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_whatsapp_config_sem_conexao ON public.whatsapp_config;
CREATE TRIGGER trg_whatsapp_config_sem_conexao BEFORE DELETE ON public.whatsapp_config
FOR EACH ROW EXECUTE FUNCTION public.marcar_conversas_sem_conexao();

CREATE OR REPLACE FUNCTION public.limpar_sem_conexao() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.whatsapp_config_id IS NOT NULL THEN NEW.sem_conexao := false; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conversations_limpar_sem_conexao ON public.conversations;
CREATE TRIGGER trg_conversations_limpar_sem_conexao BEFORE UPDATE OF whatsapp_config_id ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.limpar_sem_conexao();