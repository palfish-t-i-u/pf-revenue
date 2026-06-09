-- RPC: get_payment_warnings — internal reconciliation checks
-- Checks: DUPLICATE, MISSING_DATA, ORPHAN_DATA, RATE_DEVIATION

CREATE OR REPLACE FUNCTION public.get_payment_warnings(
  base_rate numeric DEFAULT 3700,
  threshold numeric DEFAULT 0.2
)
RETURNS json
LANGUAGE sql STABLE
AS $function$
WITH
duplicates AS (
  SELECT payment_id, uid, pay_time::date AS day, real_pay_vnd,
         'DUPLICATE' AS warning_type,
         'Trùng UID + ngày + số tiền' AS message
  FROM payments
  WHERE deleted_at IS NULL AND status = 'active'
    AND (uid, pay_time::date, real_pay_vnd) IN (
      SELECT uid, pay_time::date, real_pay_vnd
      FROM payments
      WHERE deleted_at IS NULL AND status = 'active'
      GROUP BY uid, pay_time::date, real_pay_vnd
      HAVING count(*) > 1
    )
),
missing_data AS (
  SELECT payment_id, uid, pay_time::date AS day, real_pay_vnd,
         'MISSING_DATA' AS warning_type,
         CASE
           WHEN sale_id IS NULL THEN 'Thiếu sale'
           WHEN channel_id IS NULL THEN 'Thiếu kênh'
           WHEN package_id IS NULL THEN 'Thiếu gói'
           WHEN gmv_final IS NULL OR gmv_final = 0 THEN 'GMV = 0'
         END AS message
  FROM payments
  WHERE deleted_at IS NULL AND status = 'active'
    AND (sale_id IS NULL OR channel_id IS NULL OR package_id IS NULL
         OR gmv_final IS NULL OR gmv_final = 0)
),
orphan_sale AS (
  SELECT p.payment_id, p.uid, p.pay_time::date AS day, p.real_pay_vnd,
         'ORPHAN_DATA' AS warning_type,
         'Sale không tồn tại trong master' AS message
  FROM payments p
  WHERE p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = p.sale_id)
),
orphan_channel AS (
  SELECT p.payment_id, p.uid, p.pay_time::date AS day, p.real_pay_vnd,
         'ORPHAN_DATA' AS warning_type,
         'Kênh không tồn tại trong master' AS message
  FROM payments p
  WHERE p.deleted_at IS NULL AND p.channel_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM channels c WHERE c.id = p.channel_id)
),
rate_deviation AS (
  SELECT payment_id, uid, pay_time::date AS day, real_pay_vnd,
         'RATE_DEVIATION' AS warning_type,
         'Tỷ giá lệch > ' || (threshold * 100)::int || '%' AS message
  FROM payments
  WHERE deleted_at IS NULL AND status = 'active'
    AND gmv_rmb IS NOT NULL AND gmv_rmb > 0 AND real_pay_vnd > 0
    AND abs(real_pay_vnd / gmv_rmb - base_rate) / base_rate > threshold
),
all_warnings AS (
  SELECT * FROM duplicates
  UNION ALL SELECT * FROM missing_data
  UNION ALL SELECT * FROM orphan_sale
  UNION ALL SELECT * FROM orphan_channel
  UNION ALL SELECT * FROM rate_deviation
)
SELECT COALESCE(json_agg(
  json_build_object(
    'payment_id', payment_id,
    'uid', uid,
    'day', day,
    'real_pay_vnd', real_pay_vnd,
    'warning_type', warning_type,
    'message', message
  ) ORDER BY warning_type, day DESC
), '[]'::json)
FROM all_warnings;
$function$;
