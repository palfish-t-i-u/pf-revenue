-- Reconciliation tables (bank + CRM)

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  txn_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                date,
  amount              numeric,
  content             text,
  matched_payment_id  uuid REFERENCES public.payments(payment_id)
);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.crm_orders (
  crm_order_id  text PRIMARY KEY,
  uid           text,
  course        text,
  activated     boolean,
  activated_at  date
);
ALTER TABLE public.crm_orders ENABLE ROW LEVEL SECURITY;
