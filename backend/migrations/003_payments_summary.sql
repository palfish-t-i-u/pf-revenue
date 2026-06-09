-- RPC: payments_summary — server-side aggregate for summary cards
-- Dumped from Supabase on 2026-06-09

CREATE OR REPLACE FUNCTION public.payments_summary(
  p_search text DEFAULT '',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_team text DEFAULT '',
  p_channel_id uuid DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL,
  p_status text DEFAULT '',
  p_bank_matched text DEFAULT '',
  p_crm_activated text DEFAULT '',
  p_extra_uids text[] DEFAULT '{}'
)
RETURNS json
LANGUAGE sql STABLE
AS $function$
  WITH filtered AS (
    SELECT status, bank_matched, crm_activated, real_pay_vnd, gmv_final
    FROM payments
    WHERE deleted_at IS NULL
      AND (
        p_search = '' OR
        uid ILIKE '%' || p_search || '%' OR
        note ILIKE '%' || p_search || '%' OR
        uid = ANY(p_extra_uids)
      )
      AND (p_date_from IS NULL OR pay_time >= p_date_from)
      AND (p_date_to IS NULL OR pay_time <= p_date_to)
      AND (p_team = '' OR team = p_team)
      AND (p_channel_id IS NULL OR channel_id = p_channel_id)
      AND (p_sale_id IS NULL OR sale_id = p_sale_id)
      AND (p_status = '' OR status = p_status)
      AND (p_bank_matched = '' OR
           (p_bank_matched = 'true' AND bank_matched = true) OR
           (p_bank_matched = 'false' AND bank_matched = false))
      AND (p_crm_activated = '' OR
           (p_crm_activated = 'true' AND crm_activated = true) OR
           (p_crm_activated = 'false' AND crm_activated = false))
  )
  SELECT json_build_object(
    'count', (SELECT count(*) FROM filtered),
    'gmv_final', COALESCE((SELECT sum(gmv_final) FROM filtered WHERE status = 'active'), 0),
    'real_pay_vnd', COALESCE((SELECT sum(real_pay_vnd) FROM filtered WHERE status = 'active'), 0),
    'unmatched_bank', (SELECT count(*) FROM filtered WHERE bank_matched = false),
    'uncrm', (SELECT count(*) FROM filtered WHERE status = 'active' AND crm_activated = false)
  );
$function$;
