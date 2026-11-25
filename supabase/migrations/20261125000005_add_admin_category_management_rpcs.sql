-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000005_add_admin_category_management_rpcs.sql
-- Purpose: Add secure, concurrency-hardened RPC functions for admin category management:
--          1. public.admin_create_category (with advisory locking on name & slug generation)
--          2. public.admin_update_category (with advisory locking on name & row lock)
--          3. public.admin_delete_category (with row lock & product reference guards)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCTION: public.admin_create_category
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_category(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_display_order INT DEFAULT 0,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_desc TEXT;
    v_clean_img TEXT;
    v_clean_order INT;
    v_clean_active BOOLEAN;
    v_base_slug TEXT;
    v_candidate_slug TEXT;
    v_collision_count INT := 0;
    v_slug_exists BOOLEAN;
    v_name_exists BOOLEAN;
    v_category public.categories%ROWTYPE;
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
            'error', 'Access denied: Only bakery administrators can create categories.'
        );
    END IF;

    -- 3. Input sanitation and validation
    v_clean_name := TRIM(COALESCE(p_name, ''));
    v_clean_desc := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_clean_img  := NULLIF(TRIM(COALESCE(p_image_url, '')), '');
    v_clean_order := COALESCE(p_display_order, 0);
    v_clean_active := COALESCE(p_is_active, true);

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name is required.');
    END IF;

    IF LENGTH(v_clean_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name cannot exceed 100 characters.');
    END IF;

    -- 4. Transaction-level advisory lock on normalized category name
    -- Serializes concurrent requests attempting to create or rename to equivalent names
    PERFORM pg_advisory_xact_lock(hashtext('category_name_' || LOWER(v_clean_name)));

    -- 5. Case-insensitive duplicate name check
    SELECT EXISTS (
        SELECT 1 FROM public.categories WHERE LOWER(name) = LOWER(v_clean_name)
    ) INTO v_name_exists;

    IF v_name_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('A category named "%s" already exists.', v_clean_name)
        );
    END IF;

    -- 6. Collision-resistant slug generation with advisory locking on candidate slug
    v_base_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := TRIM(BOTH '-' FROM v_base_slug);
    IF v_base_slug = '' THEN
        v_base_slug := 'collection';
    END IF;

    v_candidate_slug := v_base_slug;
    LOOP
        -- Acquire transaction-level advisory lock on the candidate slug to serialize concurrent slug allocations
        PERFORM pg_advisory_xact_lock(hashtext('category_slug_' || v_candidate_slug));

        SELECT EXISTS (
            SELECT 1 FROM public.categories WHERE slug = v_candidate_slug
        ) INTO v_slug_exists;

        EXIT WHEN NOT v_slug_exists;

        v_collision_count := v_collision_count + 1;
        v_candidate_slug := v_base_slug || '-' || v_collision_count::TEXT;
    END LOOP;

    -- 7. Insert category row
    INSERT INTO public.categories (
        name,
        slug,
        description,
        image_url,
        display_order,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_clean_name,
        v_candidate_slug,
        v_clean_desc,
        v_clean_img,
        v_clean_order,
        v_clean_active,
        now(),
        now()
    )
    RETURNING * INTO v_category;

    -- 8. Return success response
    RETURN jsonb_build_object(
        'success', true,
        'category', jsonb_build_object(
            'id', v_category.id,
            'name', v_category.name,
            'slug', v_category.slug,
            'description', v_category.description,
            'image_url', v_category.image_url,
            'display_order', v_category.display_order,
            'is_active', v_category.is_active,
            'created_at', v_category.created_at,
            'updated_at', v_category.updated_at
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to create category: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. FUNCTION: public.admin_update_category
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_category(
    p_category_id UUID,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_display_order INT DEFAULT 0,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_desc TEXT;
    v_clean_img TEXT;
    v_clean_order INT;
    v_clean_active BOOLEAN;
    v_name_exists BOOLEAN;
    v_category public.categories%ROWTYPE;
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
            'error', 'Access denied: Only bakery administrators can update categories.'
        );
    END IF;

    -- 3. Input sanitation and validation
    IF p_category_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid category ID is required.');
    END IF;

    v_clean_name := TRIM(COALESCE(p_name, ''));
    v_clean_desc := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_clean_img  := NULLIF(TRIM(COALESCE(p_image_url, '')), '');
    v_clean_order := COALESCE(p_display_order, 0);
    v_clean_active := COALESCE(p_is_active, true);

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name is required.');
    END IF;

    IF LENGTH(v_clean_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Category name cannot exceed 100 characters.');
    END IF;

    -- 4. Check whether category exists and lock row
    SELECT * INTO v_category
    FROM public.categories
    WHERE id = p_category_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Category with ID %s does not exist.', p_category_id)
        );
    END IF;

    -- 5. Transaction-level advisory lock on normalized category name
    -- Serializes concurrent requests attempting to rename categories to equivalent names
    PERFORM pg_advisory_xact_lock(hashtext('category_name_' || LOWER(v_clean_name)));

    -- 6. Case-insensitive duplicate name check on other categories
    SELECT EXISTS (
        SELECT 1 FROM public.categories 
        WHERE LOWER(name) = LOWER(v_clean_name) AND id <> p_category_id
    ) INTO v_name_exists;

    IF v_name_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Another category named "%s" already exists.', v_clean_name)
        );
    END IF;

    -- 7. Update category preserving existing id and slug
    UPDATE public.categories
    SET
        name = v_clean_name,
        description = v_clean_desc,
        image_url = v_clean_img,
        display_order = v_clean_order,
        is_active = v_clean_active,
        updated_at = now()
    WHERE id = p_category_id
    RETURNING * INTO v_category;

    -- 8. Return success response
    RETURN jsonb_build_object(
        'success', true,
        'category', jsonb_build_object(
            'id', v_category.id,
            'name', v_category.name,
            'slug', v_category.slug,
            'description', v_category.description,
            'image_url', v_category.image_url,
            'display_order', v_category.display_order,
            'is_active', v_category.is_active,
            'created_at', v_category.created_at,
            'updated_at', v_category.updated_at
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to update category: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. FUNCTION: public.admin_delete_category
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_category(
    p_category_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_category public.categories%ROWTYPE;
    v_product_count INT;
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
            'error', 'Access denied: Only bakery administrators can delete categories.'
        );
    END IF;

    -- 3. Input validation
    IF p_category_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valid category ID is required.');
    END IF;

    -- 4. Find and lock the category row
    SELECT * INTO v_category
    FROM public.categories
    WHERE id = p_category_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Category with ID %s does not exist.', p_category_id)
        );
    END IF;

    -- 5. Check if any products reference this category (including unavailable / archived products)
    -- Serializes against concurrent product creation/update assigning this category
    SELECT COUNT(*) INTO v_product_count
    FROM public.products
    WHERE category_id = p_category_id;

    IF v_product_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'category_id', p_category_id,
            'category_name', v_category.name,
            'product_count', v_product_count,
            'error', format('Cannot delete category "%s" because %s product%s assigned to it. Please reassign or delete these products first, or mark the category as hidden/inactive.', 
                v_category.name, 
                v_product_count, 
                CASE WHEN v_product_count = 1 THEN ' is' ELSE 's are' END
            )
        );
    END IF;

    -- 6. Permanently delete category if unreferenced (safe against ON DELETE RESTRICT)
    DELETE FROM public.categories
    WHERE id = p_category_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'deleted',
        'category_id', p_category_id,
        'category_name', v_category.name,
        'message', format('Category "%s" was permanently deleted.', v_category.name)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Failed to delete category: %s', SQLERRM)
        );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PERMISSIONS AND GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_create_category(TEXT, TEXT, TEXT, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_category(TEXT, TEXT, TEXT, INT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_category(TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_category(UUID, TEXT, TEXT, TEXT, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_category(UUID, TEXT, TEXT, TEXT, INT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_category(UUID, TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_category(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_category(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_category(UUID) TO authenticated;
