-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000006_add_cashfree_to_payment_method_enum.sql
-- Purpose: Add 'cashfree' to public.payment_method_enum for Cashfree payment gateway integration
-- ==============================================================================

ALTER TYPE public.payment_method_enum
ADD VALUE IF NOT EXISTS 'cashfree';
