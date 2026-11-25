-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY - MIGRATION
-- Migration: 20261124000001_add_update_customer_profile_rpc.sql
-- Purpose: Add secure RPC function public.update_customer_profile & harden profile provisioning
-- Description:
--   1. Adds public.update_customer_profile(...) RPC allowing authenticated customers
--      to update only their own full_name, phone, and avatar_url safely without
--      exposing direct table-level or column-level UPDATE on public.profiles.
--   2. Updates public.handle_new_user() to capture phone reliably from auth metadata
--      (raw_user_meta_data->>'phone') upon sign-up, ensuring phone is persisted
--      without requiring an active session before email verification.
--   3. Sets server-authoritative timestamps using now() (TIMESTAMPTZ).
--   4. Strict least-privilege: Revokes direct UPDATE on public.profiles from authenticated.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure handle_new_user captures phone from auth metadata on registration
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Valued Customer'),
        NEW.email,
        COALESCE(NEW.phone, NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '')),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = CASE WHEN profiles.full_name = 'Valued Customer' THEN EXCLUDED.full_name ELSE profiles.full_name END,
        phone = COALESCE(profiles.phone, EXCLUDED.phone);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Secure RPC for authenticated profile updates
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_profile(
    p_full_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_update_phone BOOLEAN DEFAULT false,
    p_update_avatar_url BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_profile public.profiles%ROWTYPE;
    v_new_name TEXT;
    v_new_phone TEXT;
    v_new_avatar TEXT;
    v_has_updates BOOLEAN := false;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Authentication check: caller must be authenticated with active session
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required. No active session found.'
        );
    END IF;

    -- 2. Lookup existing profile for the authenticated user with row locking
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_profile.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Profile not found for the authenticated user.'
        );
    END IF;

    -- 3. Validate and prepare full_name
    IF p_full_name IS NOT NULL THEN
        v_new_name := TRIM(p_full_name);
        IF v_new_name = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Full name cannot be empty.'
            );
        END IF;
        IF LENGTH(v_new_name) > 100 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Full name cannot exceed 100 characters.'
            );
        END IF;
        v_has_updates := true;
    ELSE
        v_new_name := v_profile.full_name;
    END IF;

    -- 4. Validate and prepare phone
    IF p_phone IS NOT NULL OR p_update_phone = true THEN
        v_has_updates := true;
        v_new_phone := NULLIF(TRIM(COALESCE(p_phone, '')), '');
        IF v_new_phone IS NOT NULL AND LENGTH(v_new_phone) > 30 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Phone number is too long (maximum 30 characters).'
            );
        END IF;
    ELSE
        v_new_phone := v_profile.phone;
    END IF;

    -- 5. Validate and prepare avatar_url
    IF p_avatar_url IS NOT NULL OR p_update_avatar_url = true THEN
        v_has_updates := true;
        v_new_avatar := NULLIF(TRIM(COALESCE(p_avatar_url, '')), '');
    ELSE
        v_new_avatar := v_profile.avatar_url;
    END IF;

    -- 6. Check that at least one field was supplied for update
    IF NOT v_has_updates THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No valid profile fields provided for update.'
        );
    END IF;

    -- 7. Execute atomic update strictly scoped to authenticated user
    UPDATE public.profiles
    SET full_name = v_new_name,
        phone = v_new_phone,
        avatar_url = v_new_avatar,
        updated_at = v_now
    WHERE id = v_user_id
    RETURNING * INTO v_profile;

    -- 8. Return formatted profile matching DatabaseProfile interface
    RETURN jsonb_build_object(
        'success', true,
        'profile', jsonb_build_object(
            'id', v_profile.id,
            'full_name', v_profile.full_name,
            'email', v_profile.email,
            'phone', v_profile.phone,
            'avatar_url', v_profile.avatar_url,
            'created_at', v_profile.created_at,
            'updated_at', v_profile.updated_at
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Permission hardening
-- ------------------------------------------------------------------------------
-- Revoke column-level and table-level UPDATE privileges on public.profiles from authenticated
REVOKE UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles FROM authenticated;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

-- Ensure anon role has no access to profiles table
REVOKE ALL ON TABLE public.profiles FROM anon;

-- Function execution privileges: strictly authenticated role only
REVOKE ALL ON FUNCTION public.update_customer_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_customer_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_customer_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
