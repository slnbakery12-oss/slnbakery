-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000003_add_admin_delete_product_rpc.sql
-- Purpose: Add intelligent public.admin_delete_product RPC with archive/hard-delete logic
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCTION: public.admin_delete_product
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_product(
    p_product_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_product public.products%ROWTYPE;
    v_has_orders BOOLEAN;
    v_order_count INT;
BEGIN
    -- 1. Authentication check
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    -- 2. Authorization check: strictly administrator
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Access denied: Only bakery administrators can remove or archive products.'
        );
    END IF;

    -- 3. Input validation
    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Valid product ID is required.'
        );
    END IF;

    -- 4. Find and lock the requested product row to serialize concurrent operations
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Product with ID %s does not exist.', p_product_id)
        );
    END IF;

    -- 5. Check whether any historical order items reference this product
    SELECT EXISTS (
        SELECT 1 FROM public.order_items WHERE product_id = p_product_id
    ) INTO v_has_orders;

    -- 6. Intelligent deletion branch
    IF v_has_orders THEN
        -- Case A: Historical orders exist -> ARCHIVE / SOFT-DELETE
        -- Preserve product row, inventory, variants, prices, and storage images for record integrity
        UPDATE public.products
        SET
            is_available = false,
            updated_at = now()
        WHERE id = p_product_id;

        SELECT COUNT(*) INTO v_order_count
        FROM public.order_items
        WHERE product_id = p_product_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'archived',
            'product_id', p_product_id,
            'product_name', v_product.name,
            'order_count', v_order_count,
            'message', format('Product "%s" is linked to historical orders (%s order items) and has been archived (marked Sold Out).', v_product.name, v_order_count)
        );
    ELSE
        -- Case B: No historical orders exist -> PERMANENT / HARD DELETE
        -- Foreign key CASCADE removes product_variants, inventory, product_images, tag_mappings, and wishlist_items
        DELETE FROM public.products
        WHERE id = p_product_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'deleted',
            'product_id', p_product_id,
            'product_name', v_product.name,
            'message', format('Product "%s" had no order history and was permanently removed from the catalog.', v_product.name)
        );
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to delete product: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. PERMISSIONS AND GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_delete_product(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_product(BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(BIGINT) TO authenticated;
