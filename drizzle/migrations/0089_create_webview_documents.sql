CREATE TABLE public.webview_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webview_id uuid NOT NULL REFERENCES public.webviews(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webview_documents TO authenticated;
GRANT ALL ON public.webview_documents TO service_role;

ALTER TABLE public.webview_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY webview_documents_select_project
ON public.webview_documents
FOR SELECT
TO authenticated
USING (project_id = public.current_project_id());

CREATE INDEX webview_documents_recent_idx
ON public.webview_documents (webview_id, created_at DESC);