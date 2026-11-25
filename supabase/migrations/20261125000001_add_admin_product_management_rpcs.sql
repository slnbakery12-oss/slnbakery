-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000001_add_admin_product_management_rpcs.sql
-- Purpose: Add atomic public.admin_create_product and public.admin_update_product RPCs
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCTION: public.admin_create_product
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_product(
    p_name TEXT,
    p_description TEXT,
    p_base_price NUMERIC,
    p_category_name TEXT,
    p_image_url TEXT,
    p_is_available BOOLEAN DEFAULT true,
    p_is_bestseller BOOLEAN DEFAULT false,
    p_variant_template TEXT DEFAULT 'standard'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_desc TEXT;
    v_clean_cat TEXT;
    v_clean_img TEXT;
    v_clean_template TEXT;
    v_category_id UUID;
    v_base_slug TEXT;
    v_candidate_slug TEXT;
    v_collision_count INT := 0;
    v_slug_exists BOOLEAN;
    v_product_id BIGINT;
    v_product public.products%ROWTYPE;
    v_variants JSONB;
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
            'error', 'Access denied: Only bakery administrators can add new products.'
        );
    END IF;

    -- 3. Input sanitation and validation
    v_clean_name := TRIM(COALESCE(p_name, ''));
    v_clean_desc := TRIM(COALESCE(p_description, ''));
    v_clean_cat  := TRIM(COALESCE(p_category_name, ''));
    v_clean_img  := TRIM(COALESCE(p_image_url, ''));
    v_clean_template := LOWER(TRIM(COALESCE(p_variant_template, 'standard')));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product name is required.');
    END IF;

    IF v_clean_desc = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product description is required.');
    END IF;

    IF p_base_price IS NULL OR p_base_price <= 0 OR p_base_price > 99999999.99 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product price must be between ₹1 and ₹99,999,999.99.');
    END IF;

    IF v_clean_cat = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name is required.');
    END IF;

    IF v_clean_img = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product image URL is required.');
    END IF;

    IF v_clean_template NOT IN ('cake', 'cupcake_box', 'cookie_pack', 'assorted_box', 'standard') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Invalid variant template "%s". Expected: cake, cupcake_box, cookie_pack, assorted_box, or standard.', v_clean_template)
        );
    END IF;

    -- 4. Category resolution (exact match on active category)
    SELECT id INTO v_category_id
    FROM public.categories
    WHERE LOWER(name) = LOWER(v_clean_cat) AND is_active = true
    LIMIT 1;

    IF v_category_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Active category "%s" was not found in the database.', v_clean_cat)
        );
    END IF;

    -- 5. Collision-resistant slug generation
    v_base_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := TRIM(BOTH '-' FROM v_base_slug);
    IF v_base_slug = '' THEN
        v_base_slug := 'bake';
    END IF;

    v_candidate_slug := v_base_slug;
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM public.products WHERE slug = v_candidate_slug
        ) INTO v_slug_exists;

        EXIT WHEN NOT v_slug_exists;

        v_collision_count := v_collision_count + 1;
        v_candidate_slug := v_base_slug || '-' || v_collision_count::TEXT;
    END LOOP;

    -- 6. Insert product row (let PostgreSQL generate the BIGINT identity ID)
    INSERT INTO public.products (
        category_id,
        slug,
        name,
        description,
        base_price,
        rating,
        review_count,
        is_bestseller,
        is_available,
        is_eggless_available,
        is_with_egg_available,
        image_url,
        created_at,
        updated_at
    ) VALUES (
        v_category_id,
        v_candidate_slug,
        v_clean_name,
        v_clean_desc,
        ROUND(p_base_price, 2),
        5.0,
        0,
        COALESCE(p_is_bestseller, false),
        COALESCE(p_is_available, true),
        true,
        true,
        v_clean_img,
        now(),
        now()
    )
    RETURNING * INTO v_product;

    v_product_id := v_product.id;

    -- 7. Insert active variants in the same transaction according to the chosen template
    IF v_clean_template = 'cake' THEN
        INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active)
        VALUES
            (v_product_id, '500g', 500, 1.00, ROUND(p_base_price * 1.00), true),
            (v_product_id, '1kg', 1000, 1.90, ROUND(p_base_price * 1.90), true),
            (v_product_id, '1.5kg', 1500, 2.80, ROUND(p_base_price * 2.80), true),
            (v_product_id, '2kg', 2000, 3.70, ROUND(p_base_price * 3.70), true);
    ELSIF v_clean_template = 'cupcake_box' THEN
        INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active)
        VALUES
            (v_product_id, 'Box of 6', 300, 1.00, ROUND(p_base_price * 1.00), true);
    ELSIF v_clean_template = 'cookie_pack' THEN
        INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active)
        VALUES
            (v_product_id, 'Pack of 6', 250, 1.00, ROUND(p_base_price * 1.00), true);
    ELSIF v_clean_template = 'assorted_box' THEN
        INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active)
        VALUES
            (v_product_id, 'Assorted Box', 400, 1.00, ROUND(p_base_price * 1.00), true);
    ELSE -- 'standard'
        INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active)
        VALUES
            (v_product_id, 'Standard', 500, 1.00, ROUND(p_base_price * 1.00), true);
    END IF;

    -- 8. Fetch the newly created variants for the response payload
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pv.id,
            'product_id', pv.product_id,
            'weight_label', pv.weight_label,
            'weight_in_grams', pv.weight_in_grams,
            'price_multiplier', pv.price_multiplier,
            'calculated_price', pv.calculated_price,
            'is_active', pv.is_active
        ) ORDER BY pv.weight_in_grams ASC
    ) INTO v_variants
    FROM public.product_variants pv
    WHERE pv.product_id = v_product_id;

    -- 9. Return success JSONB
    RETURN jsonb_build_object(
        'success', true,
        'product', jsonb_build_object(
            'id', v_product.id,
            'name', v_product.name,
            'slug', v_product.slug,
            'description', v_product.description,
            'base_price', v_product.base_price,
            'category_id', v_product.category_id,
            'category_name', v_clean_cat,
            'image_url', v_product.image_url,
            'is_available', v_product.is_available,
            'is_bestseller', v_product.is_bestseller,
            'created_at', v_product.created_at,
            'updated_at', v_product.updated_at
        ),
        'variants', COALESCE(v_variants, '[]'::jsonb)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to create product: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. FUNCTION: public.admin_update_product
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_product(
    p_product_id BIGINT,
    p_name TEXT,
    p_description TEXT,
    p_base_price NUMERIC,
    p_category_name TEXT,
    p_image_url TEXT,
    p_is_available BOOLEAN DEFAULT true,
    p_is_bestseller BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_desc TEXT;
    v_clean_cat TEXT;
    v_clean_img TEXT;
    v_category_id UUID;
    v_product public.products%ROWTYPE;
    v_variants JSONB;
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
            'error', 'Access denied: Only bakery administrators can update products.'
        );
    END IF;

    -- 3. Input sanitation and validation
    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid product ID is required.');
    END IF;

    v_clean_name := TRIM(COALESCE(p_name, ''));
    v_clean_desc := TRIM(COALESCE(p_description, ''));
    v_clean_cat  := TRIM(COALESCE(p_category_name, ''));
    v_clean_img  := TRIM(COALESCE(p_image_url, ''));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product name is required.');
    END IF;

    IF v_clean_desc = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product description is required.');
    END IF;

    IF p_base_price IS NULL OR p_base_price <= 0 OR p_base_price > 99999999.99 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product price must be between ₹1 and ₹99,999,999.99.');
    END IF;

    IF v_clean_cat = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name is required.');
    END IF;

    IF v_clean_img = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product image URL is required.');
    END IF;

    -- 4. Category resolution (exact match on active category)
    SELECT id INTO v_category_id
    FROM public.categories
    WHERE LOWER(name) = LOWER(v_clean_cat) AND is_active = true
    LIMIT 1;

    IF v_category_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Active category "%s" was not found in the database.', v_clean_cat)
        );
    END IF;

    -- 5. Update the existing product without altering id or slug
    UPDATE public.products
    SET
        name = v_clean_name,
        description = v_clean_desc,
        base_price = ROUND(p_base_price, 2),
        category_id = v_category_id,
        image_url = v_clean_img,
        is_available = COALESCE(p_is_available, true),
        is_bestseller = COALESCE(p_is_bestseller, false),
        updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_product;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Product with ID %s does not exist.', p_product_id)
        );
    END IF;

    -- 6. Recalculate existing variant prices using existing multipliers
    UPDATE public.product_variants
    SET calculated_price = ROUND(p_base_price * price_multiplier)
    WHERE product_id = p_product_id;

    -- 7. Fetch updated variants for the response payload
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', pv.id,
            'product_id', pv.product_id,
            'weight_label', pv.weight_label,
            'weight_in_grams', pv.weight_in_grams,
            'price_multiplier', pv.price_multiplier,
            'calculated_price', pv.calculated_price,
            'is_active', pv.is_active
        ) ORDER BY pv.weight_in_grams ASC
    ) INTO v_variants
    FROM public.product_variants pv
    WHERE pv.product_id = p_product_id;

    -- 8. Return success response
    RETURN jsonb_build_object(
        'success', true,
        'product', jsonb_build_object(
            'id', v_product.id,
            'name', v_product.name,
            'slug', v_product.slug,
            'description', v_product.description,
            'base_price', v_product.base_price,
            'category_id', v_product.category_id,
            'category_name', v_clean_cat,
            'image_url', v_product.image_url,
            'is_available', v_product.is_available,
            'is_bestseller', v_product.is_bestseller,
            'created_at', v_product.created_at,
            'updated_at', v_product.updated_at
        ),
        'variants', COALESCE(v_variants, '[]'::jsonb)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to update product: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS AND GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_create_product(TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_product(TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_product(TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_product(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_product(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_product(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
