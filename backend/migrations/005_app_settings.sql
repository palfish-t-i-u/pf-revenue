-- 005: app_settings key-value store for runtime configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Seed initial GMV settings
INSERT INTO public.app_settings (key, value) VALUES
  ('gmv_exchange_rate', '3700'),
  ('gmv_cutoff_at', '"2026-06-01T00:00:00+00:00"')
ON CONFLICT (key) DO NOTHING;
