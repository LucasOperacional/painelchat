ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
CREATE INDEX IF NOT EXISTS conversations_pinned_at_idx ON public.conversations (pinned_at) WHERE pinned_at IS NOT NULL;