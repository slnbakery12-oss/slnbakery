-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000007_add_cashfree_payment_support.sql
-- Purpose: Add Cashfree payment gateway columns to public.payments, update
--          create_order_securely to support 'cashfree', and create dedicated
--          atomic RPCs for Cashfree order reservation, attachment, and capture.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD CASHFREE COLUMNS TO public.payments
-- ------------------------------------------------------------------------------

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS cf_order_id TEXT,
    ADD COLUMN IF NOT EXISTS cf_payment_id TEXT,
    ADD COLUMN IF NOT EXISTS payment_session_id TEXT,
    ADD COLUMN IF NOT EXISTS cf_order_status TEXT,
    ADD COLUMN IF NOT EXISTS cf_webhook_signature TEXT,
    ADD COLUMN IF NOT EXISTS cf_order_reservation_token UUID,
    ADD COLUMN IF NOT EXISTS cf_order_reserved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cf_order_reservation_expires_at TIMESTAMPTZ;

-- Unique constraints for cf_order_id and cf_payment_id (guarantees 1:1 mapping and no duplicate captures)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_cf_order_id_key'
    ) THEN
        ALTER TABLE public.payments ADD CONSTRAINT payments_cf_order_id_key UNIQUE (cf_order_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_cf_payment_id_key'
    ) THEN
        ALTER TABLE public.payments ADD CONSTRAINT payments_cf_payment_id_key UNIQUE (cf_payment_id);
    END IF;
END $$;

-- Partial index for active reservation token lookups (no redundant index on cf_order_id/cf_payment_id)
CREATE INDEX IF NOT EXISTS idx_payments_cf_reservation 
    ON public.payments(cf_order_reservation_token) 
    WHERE cf_order_reservation_token IS NOT NULL;


-- ------------------------------------------------------------------------------
-- 2. UPDATE public.create_order_securely FOR CASHFREE SUPPORT
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_securely(
    p_idempotency_key TEXT,
    p_customer_name TEXT,
    p_customer_email TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_delivery_date DATE,
    p_delivery_time_slot TEXT,
    p_special_instructions TEXT,
    p_payment_method public.payment_method_enum,
    p_coupon_code TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_idempotency_key TEXT;
    v_order_id UUID;
    v_order_number TEXT;
    v_guest_token UUID;
    v_subtotal NUMERIC(10, 2) := 0;
    v_delivery_fee NUMERIC(10, 2) := 49.00;
    v_discount NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_initial_status public.order_status_enum;
    v_settings public.bakery_settings%ROWTYPE;
    v_item RECORD;
    v_product public.products%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_unit_price NUMERIC(10, 2);
    v_item_total NUMERIC(10, 2);
    v_coupon public.coupons%ROWTYPE;
    v_user_coupon_count INT;
    v_postal_code TEXT;
    v_slot_match TEXT[];
    v_slot_hour INT;
    v_current_ist_date DATE;
    v_slot_start_ist TIMESTAMPTZ;
    v_existing_order RECORD;
BEGIN
    -- 1. Idempotency Check & Transaction-Level Advisory Lock
    v_clean_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

    IF v_clean_idempotency_key IS NOT NULL THEN
        -- Acquire a transaction-level advisory lock on the hashed idempotency key
        -- Prevents concurrent requests with the identical key from racing
        PERFORM pg_advisory_xact_lock(hashtext('order_idem_' || v_clean_idempotency_key));

        SELECT id, order_number, customer_id, customer_email, customer_phone, guest_access_token, total_amount, status 
        INTO v_existing_order
        FROM public.orders
        WHERE idempotency_key = v_clean_idempotency_key;

        IF FOUND THEN
            -- Context verification: Prevent leaking tokens or orders across different callers
            IF auth.uid() IS NOT NULL THEN
                -- Authenticated caller: must own the existing order
                IF v_existing_order.customer_id IS DISTINCT FROM auth.uid() THEN
                    RAISE EXCEPTION 'Idempotency key collision: caller does not match order owner.';
                END IF;
            ELSE
                -- Guest caller:
                -- 1. Existing order MUST be a guest order (customer_id IS NULL)
                -- 2. Email must match exactly
                -- 3. Phone must match exactly
                IF v_existing_order.customer_id IS NOT NULL OR
                   LOWER(TRIM(v_existing_order.customer_email)) <> LOWER(TRIM(p_customer_email)) OR
                   TRIM(v_existing_order.customer_phone) <> TRIM(p_customer_phone) THEN
                    RAISE EXCEPTION 'Idempotency key collision: caller does not match order owner.';
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'guest_access_token', CASE WHEN v_existing_order.customer_id IS NULL THEN v_existing_order.guest_access_token ELSE NULL END,
                'status', v_existing_order.status,
                'total', v_existing_order.total_amount,
                'requires_online_payment', (p_payment_method IN ('razorpay', 'cashfree') AND v_existing_order.total_amount > 0)
            );
        END IF;
    END IF;

    -- 2. Validate Cart Not Empty
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Your shopping bag is empty.';
    END IF;

    -- 3. Fetch and Validate Bakery Operating Settings
    SELECT * INTO v_settings FROM public.bakery_settings WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bakery configuration is missing.';
    END IF;

    IF NOT v_settings.is_online_ordering_enabled THEN
        RAISE EXCEPTION 'Online ordering is currently paused by the bakery. Please call us directly.';
    END IF;

    IF p_payment_method = 'cash_on_delivery' AND NOT v_settings.is_cod_enabled THEN
        RAISE EXCEPTION 'Cash on Delivery is currently unavailable.';
    END IF;

    IF p_payment_method IN ('razorpay', 'cashfree') AND NOT v_settings.is_online_payment_enabled THEN
        RAISE EXCEPTION 'Online payments are currently unavailable.';
    END IF;

    IF p_payment_method IN ('upi_simulation', 'card_simulation') AND NOT v_settings.allow_simulated_payments THEN
        RAISE EXCEPTION 'Simulated payment methods are disabled in production.';
    END IF;

    -- 4. Validate Delivery Postal Code
    v_postal_code := (regexp_match(p_delivery_address, '\m([1-9][0-9]{5})\M'))[1];
    IF v_postal_code IS NULL THEN
        RAISE EXCEPTION 'Please provide a valid 6-digit postal code in the delivery address.';
    END IF;

    IF v_settings.serviceable_postal_codes IS NOT NULL 
       AND jsonb_array_length(v_settings.serviceable_postal_codes) > 0 
       AND NOT (v_settings.serviceable_postal_codes ? v_postal_code) THEN
        RAISE EXCEPTION 'Postal code "%" is outside our delivery area.', v_postal_code;
    END IF;

    -- 5. Consistent Indian Standard Time (IST) Date & Lead Time Calculations
    -- (now() AT TIME ZONE 'Asia/Kolkata')::DATE extracts the current calendar date in IST
    -- with zero dependence on the PostgreSQL session's TIMEZONE configuration.
    v_current_ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;

    IF p_delivery_date < v_current_ist_date THEN
        RAISE EXCEPTION 'Delivery date cannot be in the past.';
    END IF;

    IF p_delivery_date > (v_current_ist_date + v_settings.max_advance_booking_days) THEN
        RAISE EXCEPTION 'Orders can only be scheduled up to % days in advance.', v_settings.max_advance_booking_days;
    END IF;

    -- Validate Delivery Time Slot against Allowed Bakery Slots
    IF p_delivery_time_slot IS NULL OR TRIM(p_delivery_time_slot) = '' THEN
        RAISE EXCEPTION 'Please select a delivery time slot.';
    END IF;

    IF v_settings.delivery_time_slots IS NOT NULL 
       AND jsonb_array_length(v_settings.delivery_time_slots) > 0 
       AND NOT (v_settings.delivery_time_slots ? TRIM(p_delivery_time_slot)) THEN
        RAISE EXCEPTION 'Delivery time slot "%" is not valid or no longer offered. Please select a valid slot.', p_delivery_time_slot;
    END IF;

    -- Strict Delivery Time Slot Format Validation (1-12 hours AM/PM)
    v_slot_match := regexp_match(TRIM(p_delivery_time_slot), '^(1[0-2]|[1-9])\s*(AM|PM)\s*[\u2013\u2014\-]\s*(1[0-2]|[1-9])\s*(AM|PM)$');
    IF v_slot_match IS NULL THEN
        RAISE EXCEPTION 'Malformed delivery time slot format "%". Expected format e.g. "10 AM – 1 PM".', p_delivery_time_slot;
    END IF;

    -- Enforce min_lead_time_hours for Same-Day Delivery in IST
    -- Accurate 12-hour to 24-hour conversion: handles midnight (12 AM = 0) and noon (12 PM = 12)
    v_slot_hour := v_slot_match[1]::INT;
    IF UPPER(v_slot_match[2]) = 'PM' THEN
        IF v_slot_hour < 12 THEN
            v_slot_hour := v_slot_hour + 12;
        END IF;
    ELSIF UPPER(v_slot_match[2]) = 'AM' THEN
        IF v_slot_hour = 12 THEN
            v_slot_hour := 0;
        END IF;
    END IF;

    -- Local time in Asia/Kolkata converted to an absolute TIMESTAMPTZ.
    -- (date + make_time(...)) AT TIME ZONE 'Asia/Kolkata' is session-timezone-independent.
    v_slot_start_ist := (p_delivery_date + make_time(v_slot_hour, 0, 0)) AT TIME ZONE 'Asia/Kolkata';

    IF p_delivery_date = v_current_ist_date THEN
        IF v_slot_start_ist < (now() + (v_settings.min_lead_time_hours || ' hours')::interval) THEN
            RAISE EXCEPTION 'Orders for slot "%" require at least % hours advance preparation notice. Please choose a later slot or date.', 
                p_delivery_time_slot, v_settings.min_lead_time_hours;
        END IF;
    END IF;

    -- 6. Validate Line Items, Availability, Eggs, and Multipliers
    -- Acquired FOR SHARE lock prevents concurrent administrator deletion while preserving concurrent checkout throughput
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id BIGINT,
        weight_label TEXT,
        egg_preference TEXT,
        custom_message TEXT,
        quantity INT
    ) LOOP
        IF v_item.quantity <= 0 OR v_item.quantity > 50 THEN
            RAISE EXCEPTION 'Quantity for each bake must be between 1 and 50.';
        END IF;

        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product with ID % does not exist.', v_item.product_id;
        END IF;

        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'Product "%" is currently sold out.', v_product.name;
        END IF;

        IF v_item.egg_preference = 'Eggless' AND NOT v_product.is_eggless_available THEN
            RAISE EXCEPTION 'Eggless preparation is not available for "%".', v_product.name;
        END IF;
        IF v_item.egg_preference = 'With egg' AND NOT v_product.is_with_egg_available THEN
            RAISE EXCEPTION 'Egg preparation is not available for "%".', v_product.name;
        END IF;

        v_variant := NULL;
        IF v_item.weight_label IS NOT NULL AND TRIM(v_item.weight_label) <> '' THEN
            SELECT * INTO v_variant FROM public.product_variants 
            WHERE product_id = v_item.product_id AND weight_label = TRIM(v_item.weight_label);

            IF FOUND THEN
                IF NOT v_variant.is_active THEN
                    RAISE EXCEPTION 'Weight option "%" for "%" is currently inactive.', v_item.weight_label, v_product.name;
                END IF;
                v_unit_price := ROUND(v_product.base_price * v_variant.price_multiplier);
            ELSE
                RAISE EXCEPTION 'Weight option "%" for "%" does not exist.', v_item.weight_label, v_product.name;
            END IF;
        ELSE
            v_unit_price := v_product.base_price;
        END IF;

        v_item_total := v_unit_price * v_item.quantity;
        v_subtotal := v_subtotal + v_item_total;
    END LOOP;

    -- 7. Validate Minimum Order Value
    IF v_subtotal < v_settings.minimum_order_value THEN
        RAISE EXCEPTION 'Minimum order value is ₹%. Your subtotal is ₹%.', v_settings.minimum_order_value, v_subtotal;
    END IF;

    -- 8. Calculate Delivery Fee
    IF v_subtotal >= v_settings.free_delivery_threshold OR v_subtotal = 0 THEN
        v_delivery_fee := 0.00;
    ELSE
        v_delivery_fee := v_settings.standard_delivery_fee;
    END IF;

    -- 9. Concurrency-Safe Coupon Validation
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon 
        FROM public.coupons 
        WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
        FOR UPDATE;

        IF FOUND THEN
            IF NOT v_coupon.is_active THEN
                RAISE EXCEPTION 'Coupon "%" is currently paused.', p_coupon_code;
            END IF;

            IF v_coupon.valid_from > now() OR (v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < now()) THEN
                RAISE EXCEPTION 'Coupon "%" has expired or is not yet valid.', p_coupon_code;
            END IF;

            IF v_subtotal < v_coupon.min_order_subtotal THEN
                RAISE EXCEPTION 'Coupon "%" requires a minimum subtotal of ₹%.', p_coupon_code, v_coupon.min_order_subtotal;
            END IF;

            IF v_coupon.total_usage_limit IS NOT NULL AND v_coupon.current_usage_count >= v_coupon.total_usage_limit THEN
                RAISE EXCEPTION 'Coupon "%" has reached its maximum global usage limit.', p_coupon_code;
            END IF;

            IF auth.uid() IS NOT NULL THEN
                SELECT COUNT(*) INTO v_user_coupon_count 
                FROM public.coupon_redemptions 
                WHERE coupon_id = v_coupon.id AND user_id = auth.uid();
            ELSE
                SELECT COUNT(*) INTO v_user_coupon_count 
                FROM public.coupon_redemptions 
                WHERE coupon_id = v_coupon.id AND LOWER(customer_email) = LOWER(TRIM(p_customer_email));
            END IF;

            IF v_user_coupon_count >= v_coupon.user_usage_limit THEN
                RAISE EXCEPTION 'You have already reached the usage limit for coupon "%".', p_coupon_code;
            END IF;

            IF v_coupon.discount_type = 'percentage' THEN
                v_discount := ROUND(v_subtotal * (v_coupon.discount_value / 100.0));
                IF v_coupon.max_discount_amount IS NOT NULL AND v_discount > v_coupon.max_discount_amount THEN
                    v_discount := v_coupon.max_discount_amount;
                END IF;
            ELSE
                v_discount := LEAST(v_coupon.discount_value, v_subtotal);
            END IF;

            UPDATE public.coupons 
            SET current_usage_count = current_usage_count + 1 
            WHERE id = v_coupon.id;
        ELSE
            RAISE EXCEPTION 'Coupon code "%" is invalid.', p_coupon_code;
        END IF;
    END IF;

    v_total := GREATEST(0.00, v_subtotal + v_delivery_fee - v_discount);

    -- 10. Determine Initial Order Status (Both razorpay and cashfree initiate awaiting_payment)
    IF p_payment_method IN ('razorpay', 'cashfree') AND v_total > 0 THEN
        v_initial_status := 'awaiting_payment';
    ELSE
        v_initial_status := 'placed';
    END IF;

    -- 11. Generate IDs
    v_order_number := 'BC' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6));
    v_guest_token := gen_random_uuid();

    -- 12. Insert Order Record
    INSERT INTO public.orders (
        order_number,
        customer_id,
        guest_access_token,
        idempotency_key,
        customer_name,
        customer_email,
        customer_phone,
        delivery_street_address,
        delivery_date,
        delivery_time_slot,
        special_instructions,
        subtotal_amount,
        delivery_fee,
        discount_amount,
        total_amount,
        status
    ) VALUES (
        v_order_number,
        auth.uid(),
        v_guest_token,
        v_clean_idempotency_key,
        TRIM(p_customer_name),
        LOWER(TRIM(p_customer_email)),
        TRIM(p_customer_phone),
        TRIM(p_delivery_address),
        p_delivery_date,
        p_delivery_time_slot,
        TRIM(p_special_instructions),
        v_subtotal,
        v_delivery_fee,
        v_discount,
        v_total,
        v_initial_status
    ) RETURNING id INTO v_order_id;

    -- 13. Insert Line Items (Variant must exist and be active; cannot fall back to base price)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id BIGINT,
        weight_label TEXT,
        egg_preference TEXT,
        custom_message TEXT,
        quantity INT
    ) LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        v_variant := NULL;
        IF v_item.weight_label IS NOT NULL AND TRIM(v_item.weight_label) <> '' THEN
            SELECT * INTO v_variant FROM public.product_variants 
            WHERE product_id = v_item.product_id AND weight_label = TRIM(v_item.weight_label) AND is_active = true;
            
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Selected variant "%" for product "%" is no longer available.', v_item.weight_label, v_product.name;
            END IF;
            
            v_unit_price := ROUND(v_product.base_price * v_variant.price_multiplier);
        ELSE
            v_unit_price := v_product.base_price;
        END IF;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            variant_id,
            product_name,
            product_image_url,
            weight_label,
            egg_preference,
            custom_message,
            unit_price,
            quantity,
            total_price
        ) VALUES (
            v_order_id,
            v_product.id,
            v_variant.id,
            v_product.name,
            v_product.image_url,
            v_item.weight_label,
            v_item.egg_preference,
            TRIM(v_item.custom_message),
            v_unit_price,
            v_item.quantity,
            v_unit_price * v_item.quantity
        );
    END LOOP;

    -- 14. Audit Status History
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
    VALUES (v_order_id, NULL, v_initial_status, auth.uid(), 'Initial order creation.');

    -- 15. Record Payment Initialization (Strictly one payment record per order)
    INSERT INTO public.payments (order_id, method, status, amount)
    VALUES (
        v_order_id, 
        p_payment_method, 
        (CASE WHEN v_total = 0 THEN 'captured' ELSE 'pending' END)::public.payment_status_enum, 
        v_total
    );

    -- 16. Record Coupon Redemption
    IF v_coupon.id IS NOT NULL AND v_discount > 0 THEN
        INSERT INTO public.coupon_redemptions (coupon_id, order_id, user_id, customer_email, discount_amount)
        VALUES (v_coupon.id, v_order_id, auth.uid(), LOWER(TRIM(p_customer_email)), v_discount);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'guest_access_token', v_guest_token,
        'status', v_initial_status,
        'total', v_total,
        'requires_online_payment', (p_payment_method IN ('razorpay', 'cashfree') AND v_total > 0)
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. CASHFREE RESERVATION RPC: public.reserve_cashfree_order_creation
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_cashfree_order_creation(
    p_order_id UUID,
    p_guest_token UUID DEFAULT NULL,
    p_caller_id UUID DEFAULT NULL,
    p_timeout_seconds INT DEFAULT 45
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_reservation_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_timeout INT;
BEGIN
    -- 1. Lock and Verify Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Validate Caller Ownership
    IF v_order.customer_id IS NOT NULL THEN
        IF p_caller_id IS NULL OR (p_caller_id <> v_order.customer_id AND NOT public.is_staff_or_admin()) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized access to order.');
        END IF;
    ELSE
        IF p_guest_token IS NULL OR p_guest_token <> v_order.guest_access_token THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Invalid guest access token.');
        END IF;
    END IF;

    -- 3. Lock and Verify Associated Payment Record
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.');
    END IF;

    IF v_order.status <> 'awaiting_payment' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not awaiting payment. Current status: ' || v_order.status);
    END IF;

    IF v_payment.method <> 'cashfree' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment method is not Cashfree.');
    END IF;

    IF v_payment.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment is not pending. Current status: ' || v_payment.status);
    END IF;

    IF v_order.total_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order total is zero; online payment is not required.');
    END IF;

    -- 4. Fast-path: If already attached, return existing Cashfree order details immediately
    IF v_payment.cf_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_already_created', true,
            'cf_order_id', v_payment.cf_order_id,
            'payment_session_id', v_payment.payment_session_id,
            'amount', v_order.total_amount,
            'currency', v_payment.currency,
            'order_number', v_order.order_number
        );
    END IF;

    -- 5. Active Reservation Check: Prevent competing requests from generating multiple orphan orders
    IF v_payment.cf_order_reservation_token IS NOT NULL 
       AND v_payment.cf_order_reservation_expires_at > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_locked', true,
            'error', 'Payment initialization is currently in progress. Please retry in a few moments.',
            'retry_after_seconds', GREATEST(1, EXTRACT(EPOCH FROM (v_payment.cf_order_reservation_expires_at - now()))::INT)
        );
    END IF;

    -- 6. Acquire New Reservation
    v_timeout := LEAST(GREATEST(COALESCE(p_timeout_seconds, 45), 15), 120);
    v_reservation_token := gen_random_uuid();
    v_expires_at := now() + (v_timeout || ' seconds')::INTERVAL;

    UPDATE public.payments
    SET cf_order_reservation_token = v_reservation_token,
        cf_order_reserved_at = now(),
        cf_order_reservation_expires_at = v_expires_at,
        updated_at = timezone('utc', now())
    WHERE id = v_payment.id;

    RETURN jsonb_build_object(
        'success', true,
        'is_already_created', false,
        'reservation_token', v_reservation_token,
        'order_number', v_order.order_number,
        'amount', v_order.total_amount,
        'currency', v_payment.currency,
        'expires_at', v_expires_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_cashfree_order_creation FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_cashfree_order_creation TO service_role;


-- ------------------------------------------------------------------------------
-- 4. CASHFREE RELEASE RESERVATION RPC: public.release_cashfree_order_reservation
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_cashfree_order_reservation(
    p_order_id UUID,
    p_reservation_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment public.payments%ROWTYPE;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.');
    END IF;

    IF v_payment.cf_order_reservation_token = p_reservation_token 
       AND v_payment.cf_order_id IS NULL THEN
        UPDATE public.payments
        SET cf_order_reservation_token = NULL,
            cf_order_reserved_at = NULL,
            cf_order_reservation_expires_at = NULL,
            updated_at = timezone('utc', now())
        WHERE id = v_payment.id;

        RETURN jsonb_build_object('success', true);
    END IF;

    RETURN jsonb_build_object('success', false, 'reason', 'Token mismatch or already attached.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_cashfree_order_reservation FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cashfree_order_reservation TO service_role;


-- ------------------------------------------------------------------------------
-- 5. CASHFREE ATTACH ORDER RPC: public.attach_cashfree_order_id
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_cashfree_order_id(
    p_order_id UUID,
    p_cf_order_id TEXT,
    p_payment_session_id TEXT DEFAULT NULL,
    p_reservation_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_clean_cf_order_id TEXT;
    v_clean_session_id TEXT;
BEGIN
    v_clean_cf_order_id := NULLIF(TRIM(p_cf_order_id), '');
    v_clean_session_id := NULLIF(TRIM(p_payment_session_id), '');

    IF v_clean_cf_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing Cashfree order ID.');
    END IF;

    -- 1. Fetch and Lock Order Record
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Fetch and Lock Payment Record
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.');
    END IF;

    IF v_payment.method <> 'cashfree' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment method is not Cashfree.');
    END IF;

    IF v_payment.amount <> v_order.total_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount does not match order total.');
    END IF;

    -- 3. Check Existing Attached Cashfree Order ID (Idempotency preservation)
    -- If already attached, check whether it matches the incoming ID.
    -- If identical, return success even if the order/payment has progressed beyond awaiting_payment/pending!
    IF v_payment.cf_order_id IS NOT NULL THEN
        IF v_payment.cf_order_id = v_clean_cf_order_id THEN
            -- Only populate payment session ID if currently NULL in the database and provided in the request
            -- Never overwrite an existing non-NULL payment session ID
            IF v_payment.payment_session_id IS NULL AND v_clean_session_id IS NOT NULL THEN
                UPDATE public.payments
                SET payment_session_id = v_clean_session_id,
                    updated_at = timezone('utc', now())
                WHERE id = v_payment.id;

                v_payment.payment_session_id := v_clean_session_id;
            END IF;

            RETURN jsonb_build_object(
                'success', true, 
                'is_already_attached', true, 
                'cf_order_id', v_clean_cf_order_id,
                'payment_session_id', v_payment.payment_session_id
            );
        ELSE
            -- Strictly reject if attempting to overwrite with a different order ID
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'A different Cashfree order ID is already attached to this payment.',
                'existing_cf_order_id', v_payment.cf_order_id
            );
        END IF;
    END IF;

    -- 4. Initial Attachment Lifecycle Requirements:
    -- Order must still be awaiting payment and payment must be pending
    IF v_order.status <> 'awaiting_payment' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not awaiting payment. Current status: ' || v_order.status);
    END IF;

    IF v_payment.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment is not pending. Current status: ' || v_payment.status);
    END IF;

    -- 5. Mandatory Reservation Token and Expiration Validation for New Attachment:
    -- Require non-NULL token, token match, and active unexpired reservation lock
    IF p_reservation_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing reservation token.');
    END IF;

    IF v_payment.cf_order_reservation_token IS NULL 
       OR v_payment.cf_order_reservation_token <> p_reservation_token THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation token mismatch. Another creation attempt has taken precedence.');
    END IF;

    IF v_payment.cf_order_reservation_expires_at IS NULL 
       OR v_payment.cf_order_reservation_expires_at <= now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation lock has expired. Please re-initialize payment.');
    END IF;

    -- 6. Prevent assigning an order ID already bound to another order
    IF EXISTS (SELECT 1 FROM public.payments WHERE cf_order_id = v_clean_cf_order_id AND id <> v_payment.id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cashfree order ID already in use for another order.');
    END IF;

    -- 7. Attach ID and clear reservation
    UPDATE public.payments 
    SET cf_order_id = v_clean_cf_order_id,
        payment_session_id = COALESCE(v_clean_session_id, payment_session_id),
        cf_order_reservation_token = NULL,
        cf_order_reserved_at = NULL,
        cf_order_reservation_expires_at = NULL,
        updated_at = timezone('utc', now())
    WHERE id = v_payment.id;

    RETURN jsonb_build_object(
        'success', true, 
        'cf_order_id', v_clean_cf_order_id,
        'payment_session_id', COALESCE(v_clean_session_id, v_payment.payment_session_id)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_cashfree_order_id FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_cashfree_order_id TO service_role;


-- ------------------------------------------------------------------------------
-- 6. CASHFREE CONFIRM VERIFIED PAYMENT RPC: public.confirm_cashfree_payment_verified
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_cashfree_payment_verified(
    p_order_id UUID,
    p_cf_order_id TEXT,
    p_cf_payment_id TEXT,
    p_amount NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'INR',
    p_cf_webhook_signature TEXT DEFAULT NULL,
    p_gateway_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_clean_order_id TEXT;
    v_clean_payment_id TEXT;
BEGIN
    v_clean_order_id := NULLIF(TRIM(p_cf_order_id), '');
    v_clean_payment_id := NULLIF(TRIM(p_cf_payment_id), '');

    -- 1. Fetch and Lock Order Record
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Fetch and Lock Payment Record
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated payment record not found.');
    END IF;

    -- 3. Validate Payment Method
    IF v_payment.method <> 'cashfree' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment method is not Cashfree.');
    END IF;

    -- 4. Validate Currency
    IF UPPER(TRIM(COALESCE(p_currency, 'INR'))) <> 'INR' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Currency must be INR.');
    END IF;

    -- 5. Validate Cashfree Order ID
    IF v_clean_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing Cashfree order ID.');
    END IF;

    IF v_payment.cf_order_id IS NULL OR v_payment.cf_order_id <> v_clean_order_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mismatched Cashfree order ID.');
    END IF;

    -- 6. Validate Cashfree Payment ID
    IF v_clean_payment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing Cashfree payment ID.');
    END IF;

    -- 7. Mandatory Payment Amount Validation
    -- Must be non-NULL, positive, have no more than 2 decimal places, and match order total exactly.
    -- Executed before ANY payment or order state mutation.
    IF p_amount IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount is required.');
    END IF;

    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    IF p_amount <> ROUND(p_amount, 2) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount cannot have more than two decimal places.');
    END IF;

    IF p_amount <> v_order.total_amount THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Payment amount mismatch: expected ₹' || v_order.total_amount || ', received ₹' || p_amount || '.'
        );
    END IF;

    -- 8. Prevent Duplicate Payment ID Assigned to Another Payment Record
    IF EXISTS (
        SELECT 1 FROM public.payments 
        WHERE cf_payment_id = v_clean_payment_id 
          AND id <> v_payment.id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Cashfree payment ID has already been credited to another transaction.'
        );
    END IF;

    -- 9. Protect Already Refunded Payments
    IF v_payment.status = 'refunded' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment has already been refunded. Cannot capture or modify payment state.'
        );
    END IF;

    -- 10. Strict Captured-Payment Idempotency Check
    IF v_payment.status = 'captured' THEN
        IF v_payment.cf_payment_id IS NULL OR v_payment.cf_payment_id <> v_clean_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment already captured with a different or missing Cashfree payment ID (' || COALESCE(v_payment.cf_payment_id, 'NULL') || ').'
            );
        END IF;

        -- Store any additional signature or response payload if missing
        IF (p_cf_webhook_signature IS NOT NULL AND v_payment.cf_webhook_signature IS NULL)
           OR (p_gateway_response IS NOT NULL AND v_payment.gateway_response IS NULL) THEN
            UPDATE public.payments 
            SET cf_webhook_signature = COALESCE(v_payment.cf_webhook_signature, p_cf_webhook_signature),
                gateway_response = COALESCE(p_gateway_response, v_payment.gateway_response),
                updated_at = timezone('utc', now())
            WHERE id = v_payment.id;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'is_already_confirmed', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status
        );
    END IF;

    -- 11. Idempotency Check for Already Refund-Pending Payments
    IF v_payment.status = 'refund_pending' THEN
        IF v_payment.cf_payment_id IS NOT NULL AND v_payment.cf_payment_id = v_clean_payment_id THEN
            -- Update signature/gateway response if missing
            IF (p_cf_webhook_signature IS NOT NULL AND v_payment.cf_webhook_signature IS NULL)
               OR (p_gateway_response IS NOT NULL AND v_payment.gateway_response IS NULL) THEN
                UPDATE public.payments 
                SET cf_webhook_signature = COALESCE(v_payment.cf_webhook_signature, p_cf_webhook_signature),
                    gateway_response = COALESCE(p_gateway_response, v_payment.gateway_response),
                    updated_at = timezone('utc', now())
                WHERE id = v_payment.id;
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'is_already_refund_pending', true,
                'error', 'Order was already ' || v_order.status || '. Payment was previously verified and flagged for refund.',
                'order_status', v_order.status,
                'payment_status', 'refund_pending'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Payment already marked refund_pending with a different or missing Cashfree payment ID (' || COALESCE(v_payment.cf_payment_id, 'NULL') || ').'
            );
        END IF;
    END IF;

    -- 12. Cancelled / Rejected Order Defense:
    -- Verified late payments for cancelled/rejected orders transition to refund_pending
    -- and NEVER resurrect the order to 'placed' or 'confirmed'!
    IF v_order.status IN ('cancelled', 'rejected') THEN
        UPDATE public.payments
        SET status = 'refund_pending',
            cf_payment_id = v_clean_payment_id,
            cf_order_status = 'PAID_LATE',
            cf_webhook_signature = COALESCE(p_cf_webhook_signature, cf_webhook_signature),
            gateway_response = COALESCE(p_gateway_response, gateway_response),
            updated_at = timezone('utc', now())
        WHERE id = v_payment.id;

        INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
        VALUES (v_order.id, v_order.status, v_order.status, NULL, 
                'Late verified payment received for ' || v_order.status || ' order via Cashfree (' || v_clean_payment_id || '). Marked refund_pending.');

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order was already ' || v_order.status || '. Payment verified and flagged for refund.',
            'order_status', v_order.status,
            'payment_status', 'refund_pending'
        );
    END IF;

    -- 13. Payment and Order Status Eligibility for Capture
    -- Payment must be in ('pending', 'authorized', 'failed')
    IF v_payment.status NOT IN ('pending', 'authorized', 'failed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment status "' || v_payment.status || '" is not eligible for payment capture.'
        );
    END IF;

    -- Order must be in ('awaiting_payment', 'payment_failed')
    IF v_order.status NOT IN ('awaiting_payment', 'payment_failed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order status "' || v_order.status || '" is not eligible for payment capture.'
        );
    END IF;

    -- 14. Capture Payment Record
    UPDATE public.payments
    SET status = 'captured',
        cf_payment_id = v_clean_payment_id,
        cf_order_status = 'PAID',
        cf_webhook_signature = COALESCE(p_cf_webhook_signature, cf_webhook_signature),
        gateway_response = COALESCE(p_gateway_response, gateway_response),
        updated_at = timezone('utc', now())
    WHERE id = v_payment.id;

    -- 15. Transition Order Status to 'placed'
    UPDATE public.orders
    SET status = 'placed',
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- Record status transition in audit history
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
    VALUES (
        v_order.id, 
        v_order.status, 
        'placed', 
        v_order.customer_id, 
        'Online payment verified and captured via Cashfree (' || v_clean_payment_id || ').'
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_already_confirmed', false,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'placed'
    );
END;
$$;

-- Restrict direct execution from public and anon: only service_role (Edge Functions) can invoke
REVOKE EXECUTE ON FUNCTION public.confirm_cashfree_payment_verified FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cashfree_payment_verified TO service_role;
