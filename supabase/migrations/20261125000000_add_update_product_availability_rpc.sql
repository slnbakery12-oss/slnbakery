-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000000_add_update_product_availability_rpc.sql
-- Purpose: Add atomic public.update_product_availability RPC for staff and admin
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_product_availability(
    p_product_id BIGINT,
    p_is_available BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_product public.products%ROWTYPE;
BEGIN
    -- 1. Authentication check: reject unauthenticated callers immediately
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    -- 2. Authorization check: strictly staff or admin
    IF NOT public.is_staff_or_admin() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Access denied: Only bakery staff or administrators can update product availability.'
        );
    END IF;

    -- 3. Parameter validation
    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Valid product ID is required.'
        );
    END IF;

    IF p_is_available IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Availability status must be explicitly specified (true or false).'
        );
    END IF;

    -- 4. Execute atomic update (only is_available and updated_at)
    UPDATE public.products
    SET 
        is_available = p_is_available,
        updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_product;

    -- 5. Verify target product was found
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Product with ID %s does not exist.', p_product_id)
        );
    END IF;

    -- 6. Return updated product details
    RETURN jsonb_build_object(
        'success', true,
        'product', jsonb_build_object(
            'id', v_product.id,
            'name', v_product.name,
            'is_available', v_product.is_available,
            'updated_at', v_product.updated_at
        )
    );
END;
$$;

-- Strict least-privilege security permissions
REVOKE ALL ON FUNCTION public.update_product_availability(BIGINT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_product_availability(BIGINT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_product_availability(BIGINT, BOOLEAN) TO authenticated;
