DO $$
DECLARE
  t text;
  central uuid;
  tabelas text[] := ARRAY[
    'contacts','conversations','messages','transfers','queues','queue_agents','departments',
    'chatbots','chatbot_options','chatbot_sessions','whatsapp_config','agent_connections',
    'button_menus','broadcast_campaigns','broadcast_runs','cobrancas','cobranca_envios',
    'cobranca_acessos','estoque_categorias','estoque_itens','pix_charges','bank_transactions',
    'mei_clients','mei_das','das_mei_documentos','stickers','webviews','consultas_historico',
    'nfse_notas','nfse_eventos','profiles','user_roles'
  ];
BEGIN
  SELECT id INTO central FROM public.projects WHERE is_central LIMIT 1;
  FOREACH t IN ARRAY tabelas LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET project_id = %L WHERE project_id IS NULL', t, central);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (project_id)', t || '_project_idx', t);
  END LOOP;
END $$;

-- Projeto (franquia) do usuário logado; cai no projeto central quando não houver.
CREATE OR REPLACE FUNCTION public.current_project_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.project_id FROM public.profiles p WHERE p.id = auth.uid()),
    (SELECT id FROM public.projects WHERE is_central LIMIT 1)
  )
$$;

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'contacts','conversations','messages','transfers','queues','queue_agents','departments',
    'chatbots','chatbot_options','chatbot_sessions','whatsapp_config','agent_connections',
    'button_menus','broadcast_campaigns','broadcast_runs','cobrancas','cobranca_envios',
    'cobranca_acessos','estoque_categorias','estoque_itens','pix_charges','bank_transactions',
    'mei_clients','mei_das','das_mei_documentos','stickers','webviews','consultas_historico',
    'nfse_notas','nfse_eventos','profiles','user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN project_id SET DEFAULT public.current_project_id()', t);
    EXECUTE format('DROP POLICY IF EXISTS "Isolamento por franquia" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Isolamento por franquia" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (project_id = public.current_project_id())
         WITH CHECK (project_id = public.current_project_id())', t);
  END LOOP;
END $$;

-- Conversa herda a franquia do aparelho de WhatsApp que a originou.
CREATE OR REPLACE FUNCTION public.tenant_conversa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v uuid;
BEGIN
  IF NEW.whatsapp_config_id IS NOT NULL THEN
    SELECT project_id INTO v FROM public.whatsapp_config WHERE id = NEW.whatsapp_config_id;
    IF v IS NOT NULL THEN NEW.project_id := v; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_tenant ON public.conversations;
CREATE TRIGGER conversations_tenant BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tenant_conversa();

-- Mensagem herda a franquia da conversa.
CREATE OR REPLACE FUNCTION public.tenant_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v uuid;
BEGIN
  SELECT project_id INTO v FROM public.conversations WHERE id = NEW.conversation_id;
  IF v IS NOT NULL THEN NEW.project_id := v; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_tenant ON public.messages;
CREATE TRIGGER messages_tenant BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tenant_mensagem();

-- Novo usuário entra na franquia do endereço em que se cadastrou.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project uuid;
  has_admin boolean;
BEGIN
  v_project := NULLIF(NEW.raw_user_meta_data->>'project_id', '')::uuid;
  IF v_project IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project) THEN
    SELECT id INTO v_project FROM public.projects WHERE is_central LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, project_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), v_project);

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin' AND project_id = v_project
  ) INTO has_admin;

  INSERT INTO public.user_roles (user_id, role, project_id)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'agent'::public.app_role ELSE 'admin'::public.app_role END, v_project);
  RETURN NEW;
END;
$$;
