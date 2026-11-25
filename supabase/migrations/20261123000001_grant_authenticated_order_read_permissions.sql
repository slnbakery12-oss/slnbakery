-- Migration: 20261123000001_grant_authenticated_order_read_permissions.sql
-- Description: Grant table-level SELECT permissions on order-related and role tables to authenticated role.
-- RLS policies remain fully active on all tables to enforce data isolation and authorization.

GRANT SELECT ON TABLE
    public.user_roles,
    public.orders,
    public.order_items,
    public.payments,
    public.order_status_history
TO authenticated;
