-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000004_lock_products_during_checkout.sql
-- Purpose: Lock products during checkout (FOR SHARE) to prevent concurrency race
--          conditions with administrator product deletion/archival.
-- ==============================================================================

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
                'requires_online_payment', (p_payment_method = 'razorpay' AND v_existing_order.total_amount > 0)
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

    IF p_payment_method = 'razorpay' AND NOT v_settings.is_online_payment_enabled THEN
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

    -- 10. Determine Initial Order Status
    IF p_payment_method = 'razorpay' AND v_total > 0 THEN
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
        'requires_online_payment', (p_payment_method = 'razorpay' AND v_total > 0)
    );
END;
$$;
