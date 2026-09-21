CREATE TABLE public.mei_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mei_clients TO authenticated;
GRANT ALL ON public.mei_clients TO service_role;
ALTER TABLE public.mei_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mei_clients_all_auth" ON public.mei_clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.mei_das (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.mei_clients(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  paid_at date,
  file_path text,
  file_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, competencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mei_das TO authenticated;
GRANT ALL ON public.mei_das TO service_role;
ALTER TABLE public.mei_das ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mei_das_all_auth" ON public.mei_das FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX mei_das_competencia_idx ON public.mei_das (competencia);