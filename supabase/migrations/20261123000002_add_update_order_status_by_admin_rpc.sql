-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY - MIGRATION
-- Migration: 20261123000002_add_update_order_status_by_admin_rpc.sql
-- Purpose: Add secure RPC function public.update_order_status_by_admin
-- Description:
--   Enables authenticated bakery staff and administrators to securely transition
--   an order through the fulfillment pipeline (e.g. placed -> confirmed -> preparing -> ...).
--   Atomically updates public.orders and inserts an audit log into public.order_status_history.
--   Enforces strict role authorization and valid state machine transitions.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_order_status_by_admin(
    p_order_number TEXT,
    p_new_status public.order_status_enum,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_identifier TEXT;
    v_order public.orders%ROWTYPE;
    v_changed_by UUID;
    v_note TEXT;
    v_now TIMESTAMPTZ := now();
    v_is_valid_transition BOOLEAN := false;
BEGIN
    -- 1. Authentication check: reject unauthenticated callers immediately
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    -- 2. Role authorization check: verify user has 'admin' or 'staff' in public.user_roles
    IF NOT public.is_staff_or_admin() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Access denied: Only bakery staff or administrators can update order status.'
        );
    END IF;

    -- 3. Verify that the authenticated administrator/staff has an active profile record
    SELECT id INTO v_changed_by
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_changed_by IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Staff profile record not found for the authenticated user. An active profile is required to record status updates.'
        );
    END IF;

    -- 4. Input validation
    v_clean_identifier := TRIM(COALESCE(p_order_number, ''));
    IF v_clean_identifier = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order number or identifier is required.'
        );
    END IF;

    IF p_new_status IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Target order status is required.'
        );
    END IF;

    -- 5. Safe and unambiguous order lookup with row locking
    -- Unambiguously determines whether identifier is a UUID or a human order_number (e.g. BCB5DB49)
    -- avoiding mixed OR conditions across multiple rows
    IF v_clean_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_order
        FROM public.orders
        WHERE id = v_clean_identifier::uuid
        FOR UPDATE;
    ELSE
        SELECT * INTO v_order
        FROM public.orders
        WHERE order_number = UPPER(v_clean_identifier)
        FOR UPDATE;
    END IF;

    -- 6. Nonexistent order check
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order not found matching: ' || v_clean_identifier
        );
    END IF;

    -- 7. No-op check: order already at target status
    IF v_order.status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'previous_status', v_order.status,
            'status', v_order.status,
            'message', 'Order is already in ' || p_new_status::text || ' status.'
        );
    END IF;

    -- 8. Validate permitted status transitions per bakery workflow
    CASE v_order.status
        WHEN 'placed' THEN
            IF p_new_status IN ('confirmed', 'rejected') THEN
                v_is_valid_transition := true;
            END IF;
        WHEN 'confirmed' THEN
            IF p_new_status = 'preparing' THEN
                v_is_valid_transition := true;
            END IF;
        WHEN 'preparing' THEN
            IF p_new_status = 'ready_for_pickup' THEN
                v_is_valid_transition := true;
            END IF;
        WHEN 'ready_for_pickup' THEN
            IF p_new_status = 'out_for_delivery' THEN
                v_is_valid_transition := true;
            END IF;
        WHEN 'out_for_delivery' THEN
            IF p_new_status = 'delivered' THEN
                v_is_valid_transition := true;
            END IF;
        ELSE
            v_is_valid_transition := false;
    END CASE;

    IF NOT v_is_valid_transition THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status transition from "' || v_order.status::text || '" to "' || p_new_status::text || '".',
            'current_status', v_order.status,
            'attempted_status', p_new_status
        );
    END IF;

    -- 9. Generate appropriate audit note
    v_note := COALESCE(
        NULLIF(TRIM(p_notes), ''),
        CASE p_new_status
            WHEN 'confirmed' THEN 'Order accepted and confirmed by bakery staff.'
            WHEN 'rejected' THEN 'Order rejected by bakery staff.'
            WHEN 'preparing' THEN 'Order is being freshly prepared in the bakery.'
            WHEN 'ready_for_pickup' THEN 'Order is packed and ready for pickup/dispatch.'
            WHEN 'out_for_delivery' THEN 'Order is out for delivery with courier.'
            WHEN 'delivered' THEN 'Order has been successfully delivered.'
            ELSE 'Order status updated to ' || p_new_status::text || '.'
        END
    );

    -- 10. Atomic execution in single transaction: Update orders table
    UPDATE public.orders
    SET status = p_new_status,
        updated_at = v_now
    WHERE id = v_order.id;

    -- 11. Atomic execution in single transaction: Insert audit record into order_status_history
    INSERT INTO public.order_status_history (
        order_id,
        from_status,
        to_status,
        changed_by,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.status,
        p_new_status,
        v_changed_by,
        v_note,
        v_now
    );

    -- 12. Return confirmation payload
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'status', p_new_status,
        'notes', v_note,
        'updated_at', v_now
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function execution privileges
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.update_order_status_by_admin(TEXT, public.order_status_enum, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_status_by_admin(TEXT, public.order_status_enum, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_order_status_by_admin(TEXT, public.order_status_enum, TEXT) TO authenticated;
