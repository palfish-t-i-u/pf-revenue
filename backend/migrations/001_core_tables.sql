-- Core tables for pf-revenue
-- Supabase project: jozcvbbypwvzaefteoxn

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  uid       text PRIMARY KEY,
  name      text,
  phone     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Sales
CREATE TABLE IF NOT EXISTS public.sales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      text,
  team       text,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Channels
CREATE TABLE IF NOT EXISTS public.channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Packages
CREATE TABLE IF NOT EXISTS public.packages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- Payments (main table)
CREATE TABLE IF NOT EXISTS public.payments (
  payment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          text NOT NULL,
  pay_time     timestamptz NOT NULL,
  bank_day     date,
  package_id   uuid,
  payment_seq  text,
  real_pay_vnd numeric NOT NULL,
  gmv_rmb      numeric,
  gmv_final    numeric,
  channel_id   uuid,
  sale_id      uuid NOT NULL,
  team         text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  note         text,
  crm_order_id text,
  crm_activated boolean NOT NULL DEFAULT false,
  activated_at date,
  bank_matched boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_payment_row_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION set_payment_row_updated_at();

-- RBAC tables
CREATE TABLE IF NOT EXISTS public.department_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department  text NOT NULL,
  module      text NOT NULL,
  access      text NOT NULL DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, module)
);
ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.permission_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  module      text NOT NULL,
  access      text NOT NULL DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);
ALTER TABLE public.permission_overrides ENABLE ROW LEVEL SECURITY;
