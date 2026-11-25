-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY - MIGRATION
-- Migration: 20261124000002_enforce_single_default_customer_address.sql
-- Purpose: Enforce atomic single-default customer address management via RPCs
-- Description:
--   1. Normalizes existing address data so each user with >= 1 address has exactly
--      one default (newest default retained; if none, newest promoted).
--   2. Adds unique partial index idx_addresses_one_default_per_user (user_id) WHERE is_default = true.
--   3. Replaces fragile row-level triggers with atomic SECURITY DEFINER RPC functions:
--      - public.create_customer_address
--      - public.update_customer_address
--      - public.delete_customer_address
--   4. Eliminates deadlocks by acquiring the per-user transaction advisory lock
--      at the very start of each RPC before any table or row locks are taken.
--   5. Enforces single-default transitions, automatic first-address default,
--      automatic promotion on default deletion/demotion, and last-address deletion.
--   6. Enforces strict least-privilege: Revokes direct INSERT, UPDATE, DELETE on
--      public.addresses from authenticated role, requiring all mutations via RPCs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DATA NORMALIZATION (Pre-Index Cleanup)
-- ------------------------------------------------------------------------------

-- Step 1a: For users with multiple default addresses, keep only the newest default and demote others
WITH ranked_defaults AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM public.addresses
    WHERE is_default = true
)
UPDATE public.addresses a
SET is_default = false,
    updated_at = now()
FROM ranked_defaults rd
WHERE a.id = rd.id AND rd.rn > 1;

-- Step 1b: For users with >= 1 address but NO default address, promote the newest address to default
WITH users_without_default AS (
    SELECT user_id
    FROM public.addresses
    GROUP BY user_id
    HAVING BOOL_OR(is_default) = false
),
newest_address_per_user AS (
    SELECT DISTINCT ON (a.user_id) a.id
    FROM public.addresses a
    JOIN users_without_default uwd ON a.user_id = uwd.user_id
    ORDER BY a.user_id, a.created_at DESC, a.id DESC
)
UPDATE public.addresses a
SET is_default = true,
    updated_at = now()
FROM newest_address_per_user napu
WHERE a.id = napu.id;

-- ------------------------------------------------------------------------------
-- 2. UNIQUE PARTIAL INDEX (Integrity Guarantee)
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default_per_user
ON public.addresses (user_id)
WHERE is_default = true;

-- ------------------------------------------------------------------------------
-- 3. REMOVE ANY LEGACY OR PREVIOUS ROW-LEVEL TRIGGERS (Prevent Deadlocks)
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_addresses_before_delete ON public.addresses;
DROP TRIGGER IF EXISTS trg_addresses_before_write ON public.addresses;
DROP TRIGGER IF EXISTS trg_addresses_after_write ON public.addresses;

DROP FUNCTION IF EXISTS public.handle_address_before_delete();
DROP FUNCTION IF EXISTS public.handle_address_before_write();
DROP FUNCTION IF EXISTS public.handle_address_after_write();

-- ------------------------------------------------------------------------------
-- 4. ATOMIC RPC: create_customer_address
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_address(
    p_label TEXT DEFAULT 'Home',
    p_recipient_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_street_address TEXT DEFAULT NULL,
    p_landmark TEXT DEFAULT NULL,
    p_city TEXT DEFAULT 'Bejjanki',
    p_state TEXT DEFAULT 'Telangana',
    p_postal_code TEXT DEFAULT '505528',
    p_is_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_recipient_name TEXT;
    v_phone TEXT;
    v_street_address TEXT;
    v_label TEXT;
    v_city TEXT;
    v_state TEXT;
    v_postal_code TEXT;
    v_landmark TEXT;
    v_is_default BOOLEAN;
    v_has_existing BOOLEAN;
    v_has_default BOOLEAN;
    v_new_address public.addresses%ROWTYPE;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    -- 2. Concurrency serialization per user: ACQUIRED FIRST BEFORE ANY TABLE ACCESS
    PERFORM pg_advisory_xact_lock(hashtext('addresses'), hashtext(v_user_id::text));

    -- 3. Input validation
    v_recipient_name := TRIM(COALESCE(p_recipient_name, ''));
    IF v_recipient_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient name is required.');
    END IF;

    v_phone := TRIM(COALESCE(p_phone, ''));
    IF v_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Phone number is required.');
    END IF;
    IF LENGTH(v_phone) > 30 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Phone number cannot exceed 30 characters.');
    END IF;

    v_street_address := TRIM(COALESCE(p_street_address, ''));
    IF v_street_address = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Street address is required.');
    END IF;

    v_label := TRIM(COALESCE(p_label, 'Home'));
    IF v_label = '' THEN v_label := 'Home'; END IF;

    v_city := TRIM(COALESCE(p_city, 'Bejjanki'));
    IF v_city = '' THEN v_city := 'Bejjanki'; END IF;

    v_state := TRIM(COALESCE(p_state, 'Telangana'));
    IF v_state = '' THEN v_state := 'Telangana'; END IF;

    v_postal_code := TRIM(COALESCE(p_postal_code, '505528'));
    IF v_postal_code = '' THEN v_postal_code := '505528'; END IF;

    v_landmark := NULLIF(TRIM(COALESCE(p_landmark, '')), '');
    v_is_default := COALESCE(p_is_default, false);

    -- 4. Check existing addresses for this user
    SELECT EXISTS (
        SELECT 1 FROM public.addresses WHERE user_id = v_user_id
    ) INTO v_has_existing;

    IF NOT v_has_existing THEN
        -- First address for customer: always becomes default
        v_is_default := true;
    ELSIF v_is_default = true THEN
        -- Demote existing default address before inserting the new default
        UPDATE public.addresses
        SET is_default = false,
            updated_at = now()
        WHERE user_id = v_user_id
          AND is_default = true;
    ELSE
        -- Ensure user has at least one default
        SELECT EXISTS (
            SELECT 1 FROM public.addresses
            WHERE user_id = v_user_id AND is_default = true
        ) INTO v_has_default;

        IF NOT v_has_default THEN
            v_is_default := true;
        END IF;
    END IF;

    -- 5. Insert new address row
    INSERT INTO public.addresses (
        user_id,
        label,
        recipient_name,
        phone,
        street_address,
        landmark,
        city,
        state,
        postal_code,
        is_default,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_label,
        v_recipient_name,
        v_phone,
        v_street_address,
        v_landmark,
        v_city,
        v_state,
        v_postal_code,
        v_is_default,
        now(),
        now()
    )
    RETURNING * INTO v_new_address;

    -- 6. Return standard formatted JSON result
    RETURN jsonb_build_object(
        'success', true,
        'address', jsonb_build_object(
            'id', v_new_address.id,
            'user_id', v_new_address.user_id,
            'label', v_new_address.label,
            'recipient_name', v_new_address.recipient_name,
            'phone', v_new_address.phone,
            'street_address', v_new_address.street_address,
            'landmark', v_new_address.landmark,
            'city', v_new_address.city,
            'state', v_new_address.state,
            'postal_code', v_new_address.postal_code,
            'is_default', v_new_address.is_default,
            'created_at', v_new_address.created_at,
            'updated_at', v_new_address.updated_at
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC RPC: update_customer_address
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_address(
    p_address_id UUID,
    p_label TEXT DEFAULT NULL,
    p_recipient_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_street_address TEXT DEFAULT NULL,
    p_landmark TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL,
    p_update_landmark BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_address public.addresses%ROWTYPE;
    v_promote_id UUID;
    v_has_others BOOLEAN;
    v_new_label TEXT;
    v_new_recipient TEXT;
    v_new_phone TEXT;
    v_new_street TEXT;
    v_new_landmark TEXT;
    v_new_city TEXT;
    v_new_state TEXT;
    v_new_postal TEXT;
    v_new_is_default BOOLEAN;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    IF p_address_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Address ID is required.');
    END IF;

    -- 2. Concurrency serialization per user: ACQUIRED FIRST BEFORE ANY TABLE ACCESS
    PERFORM pg_advisory_xact_lock(hashtext('addresses'), hashtext(v_user_id::text));

    -- 3. Lookup target address enforcing ownership and row locking
    SELECT * INTO v_address
    FROM public.addresses
    WHERE id = p_address_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF v_address.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Address not found or unauthorized.');
    END IF;

    -- 4. Process field updates
    IF p_label IS NOT NULL THEN
        v_new_label := TRIM(p_label);
        IF v_new_label = '' THEN v_new_label := v_address.label; END IF;
    ELSE
        v_new_label := v_address.label;
    END IF;

    IF p_recipient_name IS NOT NULL THEN
        v_new_recipient := TRIM(p_recipient_name);
        IF v_new_recipient = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Recipient name cannot be empty.');
        END IF;
    ELSE
        v_new_recipient := v_address.recipient_name;
    END IF;

    IF p_phone IS NOT NULL THEN
        v_new_phone := TRIM(p_phone);
        IF v_new_phone = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Phone number cannot be empty.');
        END IF;
        IF LENGTH(v_new_phone) > 30 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Phone number cannot exceed 30 characters.');
        END IF;
    ELSE
        v_new_phone := v_address.phone;
    END IF;

    IF p_street_address IS NOT NULL THEN
        v_new_street := TRIM(p_street_address);
        IF v_new_street = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Street address cannot be empty.');
        END IF;
    ELSE
        v_new_street := v_address.street_address;
    END IF;

    IF p_update_landmark THEN
        v_new_landmark := NULLIF(TRIM(COALESCE(p_landmark, '')), '');
    ELSE
        v_new_landmark := v_address.landmark;
    END IF;

    IF p_city IS NOT NULL THEN
        v_new_city := TRIM(p_city);
        IF v_new_city = '' THEN v_new_city := v_address.city; END IF;
    ELSE
        v_new_city := v_address.city;
    END IF;

    IF p_state IS NOT NULL THEN
        v_new_state := TRIM(p_state);
        IF v_new_state = '' THEN v_new_state := v_address.state; END IF;
    ELSE
        v_new_state := v_address.state;
    END IF;

    IF p_postal_code IS NOT NULL THEN
        v_new_postal := TRIM(p_postal_code);
        IF v_new_postal = '' THEN v_new_postal := v_address.postal_code; END IF;
    ELSE
        v_new_postal := v_address.postal_code;
    END IF;

    -- 5. Handle default switching
    v_new_is_default := COALESCE(p_is_default, v_address.is_default);

    IF v_new_is_default = true AND v_address.is_default = false THEN
        -- Demote existing default address first
        UPDATE public.addresses
        SET is_default = false,
            updated_at = now()
        WHERE user_id = v_user_id
          AND id <> v_address.id
          AND is_default = true;

    ELSIF v_new_is_default = false AND v_address.is_default = true THEN
        -- User wants to unset default status on the active default
        -- Check if other addresses exist
        SELECT EXISTS (
            SELECT 1 FROM public.addresses
            WHERE user_id = v_user_id AND id <> v_address.id
        ) INTO v_has_others;

        IF NOT v_has_others THEN
            -- Only address: cannot have 0 defaults
            v_new_is_default := true;
        ELSE
            -- Promote newest other address
            SELECT id INTO v_promote_id
            FROM public.addresses
            WHERE user_id = v_user_id
              AND id <> v_address.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1;

            IF v_promote_id IS NOT NULL THEN
                UPDATE public.addresses
                SET is_default = true,
                    updated_at = now()
                WHERE id = v_promote_id;
            END IF;
        END IF;
    END IF;

    -- 6. Update the target address
    UPDATE public.addresses
    SET label = v_new_label,
        recipient_name = v_new_recipient,
        phone = v_new_phone,
        street_address = v_new_street,
        landmark = v_new_landmark,
        city = v_new_city,
        state = v_new_state,
        postal_code = v_new_postal,
        is_default = v_new_is_default,
        updated_at = now()
    WHERE id = v_address.id
    RETURNING * INTO v_address;

    -- 7. Return standard formatted JSON result
    RETURN jsonb_build_object(
        'success', true,
        'address', jsonb_build_object(
            'id', v_address.id,
            'user_id', v_address.user_id,
            'label', v_address.label,
            'recipient_name', v_address.recipient_name,
            'phone', v_address.phone,
            'street_address', v_address.street_address,
            'landmark', v_address.landmark,
            'city', v_address.city,
            'state', v_address.state,
            'postal_code', v_address.postal_code,
            'is_default', v_address.is_default,
            'created_at', v_address.created_at,
            'updated_at', v_address.updated_at
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ATOMIC RPC: delete_customer_address
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_customer_address(
    p_address_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_address public.addresses%ROWTYPE;
    v_promote_id UUID;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    IF p_address_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Address ID is required.');
    END IF;

    -- 2. Concurrency serialization per user: ACQUIRED FIRST BEFORE ANY TABLE ACCESS
    PERFORM pg_advisory_xact_lock(hashtext('addresses'), hashtext(v_user_id::text));

    -- 3. Lookup target address enforcing ownership and row locking
    SELECT * INTO v_address
    FROM public.addresses
    WHERE id = p_address_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF v_address.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Address not found or unauthorized.');
    END IF;

    -- 4. Delete the target address row
    DELETE FROM public.addresses
    WHERE id = v_address.id;

    -- 5. If the deleted address was the default, promote the newest remaining address
    IF v_address.is_default = true THEN
        SELECT id INTO v_promote_id
        FROM public.addresses
        WHERE user_id = v_user_id
        ORDER BY created_at DESC, id DESC
        LIMIT 1;

        IF v_promote_id IS NOT NULL THEN
            UPDATE public.addresses
            SET is_default = true,
                updated_at = now()
            WHERE id = v_promote_id;
        END IF;
    END IF;

    -- 6. Return success confirmation
    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', v_address.id,
        'promoted_id', v_promote_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. PERMISSION HARDENING
-- ------------------------------------------------------------------------------

-- Revoke direct mutation permissions on public.addresses from authenticated
REVOKE INSERT, UPDATE, DELETE ON TABLE public.addresses FROM authenticated;

-- Ensure anon has no access to addresses
REVOKE ALL ON TABLE public.addresses FROM anon;

-- Preserve SELECT permission on public.addresses for authenticated
GRANT SELECT ON TABLE public.addresses TO authenticated;

-- Execution privileges for the three atomic RPC functions: strictly authenticated only
REVOKE ALL ON FUNCTION public.create_customer_address(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_address(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_address(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.update_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
REVOKE ALL ON FUNCTION public.update_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_customer_address(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_customer_address(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_address(UUID) TO authenticated;
