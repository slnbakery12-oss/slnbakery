-- Migration: 20261124000000_grant_authenticated_profile_and_address_permissions.sql
-- Description: Grant targeted table and column-level permissions on public.profiles and public.addresses to authenticated role for Phase 5.5.
-- Security: Existing Row Level Security (RLS) policies remain active on all tables to enforce strict data isolation.
-- No permissions are granted to anon.

-- 1. Permissions for public.profiles
-- Authenticated users can read profiles (subject to RLS: id = auth.uid() OR public.is_staff_or_admin())
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Authenticated users can only update customer-editable profile fields (full_name, phone, avatar_url)
-- Strict least-privilege: id, email, created_at, and updated_at cannot be modified directly by authenticated users
GRANT UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;

-- 2. Permissions for public.addresses
-- Authenticated users can read, add, update, and delete their saved delivery addresses
-- Subject to RLS: user_id = auth.uid() OR public.is_admin()
-- id defaults to gen_random_uuid(), allowing authenticated INSERTs without sequence dependencies
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addresses TO authenticated;
