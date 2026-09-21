CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'out',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente',
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT 'aleatoria',
  receiver_name text NOT NULL DEFAULT '',
  receiver_document text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'misticpay',
  transaction_id text,
  end_to_end_id text,
  error_message text,
  requested_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_created_at_idx ON public.bank_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON public.bank_transactions (status);
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_provider_txid_idx ON public.bank_transactions (provider, transaction_id) WHERE transaction_id IS NOT NULL;

GRANT SELECT ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe pode ver movimentacoes" ON public.bank_transactions;
CREATE POLICY "Equipe pode ver movimentacoes"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.bank_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS bank_transactions_updated_at ON public.bank_transactions;
CREATE TRIGGER bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bank_touch_updated_at();

CREATE OR REPLACE FUNCTION public.bank_balance()
RETURNS TABLE(total_in numeric, total_out numeric, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction = 'in' AND status = 'pago'), 0)::numeric,
    COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'pago'), 0)::numeric,
    (COALESCE(SUM(amount) FILTER (WHERE direction = 'in' AND status = 'pago'), 0)
     - COALESCE(SUM(amount) FILTER (WHERE direction = 'out' AND status = 'pago'), 0))::numeric
  FROM public.bank_transactions;
$$;

GRANT EXECUTE ON FUNCTION public.bank_balance() TO authenticated, service_role;