-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY (Butter & Crumb)
-- Supabase PostgreSQL Initial Migration (Production-Hardened)
-- Migration: 20261122000000_initial_schema.sql
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. CUSTOM ENUMS & TYPES
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('customer', 'staff', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status_enum AS ENUM (
        'awaiting_payment',
        'placed',
        'confirmed',
        'preparing',
        'ready_for_pickup',
        'out_for_delivery',
        'delivered',
        'rejected',
        'cancelled',
        'payment_failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_method_enum AS ENUM (
        'cash_on_delivery',
        'razorpay',
        'upi_simulation',
        'card_simulation'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_status_enum AS ENUM (
        'pending',
        'authorized',
        'captured',
        'failed',
        'refund_pending',
        'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 2. IDENTITY, ROLES & ADDRESSES
-- ------------------------------------------------------------------------------

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Table: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.app_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Table: addresses
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home',
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    street_address TEXT NOT NULL,
    landmark TEXT,
    city TEXT NOT NULL DEFAULT 'Bejjanki',
    state TEXT NOT NULL DEFAULT 'Telangana',
    postal_code TEXT NOT NULL DEFAULT '505528',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);

-- ------------------------------------------------------------------------------
-- 3. CATALOG, CATEGORIES & INVENTORY
-- ------------------------------------------------------------------------------

-- Table: categories
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_categories_active_order ON public.categories(is_active, display_order);

-- Table: products
CREATE TABLE IF NOT EXISTS public.products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    sku TEXT UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price > 0),
    rating NUMERIC(2, 1) NOT NULL DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
    review_count INT NOT NULL DEFAULT 0 CHECK (review_count >= 0),
    is_bestseller BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_eggless_available BOOLEAN NOT NULL DEFAULT true,
    is_with_egg_available BOOLEAN NOT NULL DEFAULT true,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_available_bestseller ON public.products(is_available, is_bestseller);

-- Table: product_variants
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    weight_label TEXT NOT NULL,
    weight_in_grams INT NOT NULL CHECK (weight_in_grams > 0),
    price_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (price_multiplier > 0),
    calculated_price NUMERIC(10, 2) NOT NULL CHECK (calculated_price > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_product_variant UNIQUE (product_id, weight_label)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);

-- Table: product_images
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    alt_text TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id, display_order);

-- Table: product_tags & product_tag_mappings
CREATE TABLE IF NOT EXISTS public.product_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.product_tag_mappings (
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- Table: inventory (extensible for numerical stock tracking)
CREATE TABLE IF NOT EXISTS public.inventory (
    product_id BIGINT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    track_stock BOOLEAN NOT NULL DEFAULT false,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    allow_backorder BOOLEAN NOT NULL DEFAULT false,
    is_in_stock BOOLEAN NOT NULL DEFAULT true,
    low_stock_threshold INT NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Table: wishlist_items
CREATE TABLE IF NOT EXISTS public.wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_wishlist_user_product UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON public.wishlist_items(user_id);

-- ------------------------------------------------------------------------------
-- 4. PROMOTIONS & COUPONS
-- ------------------------------------------------------------------------------

-- Table: coupons
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_subtotal >= 0),
    max_discount_amount NUMERIC(10, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    total_usage_limit INT,
    current_usage_count INT NOT NULL DEFAULT 0 CHECK (current_usage_count >= 0),
    user_usage_limit INT NOT NULL DEFAULT 1 CHECK (user_usage_limit >= 1),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code) WHERE is_active = true;

-- ------------------------------------------------------------------------------
-- 5. ORDERS & PAYMENTS
-- ------------------------------------------------------------------------------

-- Table: orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guest_access_token UUID NOT NULL DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_street_address TEXT NOT NULL,
    delivery_date DATE NOT NULL,
    delivery_time_slot TEXT NOT NULL,
    special_instructions TEXT,
    subtotal_amount NUMERIC(10, 2) NOT NULL CHECK (subtotal_amount >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status public.order_status_enum NOT NULL DEFAULT 'placed',
    is_sample BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_guest_lookup ON public.orders(order_number, guest_access_token);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Table: order_items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_image_url TEXT,
    weight_label TEXT NOT NULL,
    egg_preference TEXT NOT NULL CHECK (egg_preference IN ('Eggless', 'With egg')),
    custom_message TEXT,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0 AND quantity <= 50),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- Table: order_status_history
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_status public.order_status_enum,
    to_status public.order_status_enum NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id);

-- Table: payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method public.payment_method_enum NOT NULL,
    status public.payment_status_enum NOT NULL DEFAULT 'pending',
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    gateway_response JSONB,
    is_test_mode BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order ON public.payments(razorpay_order_id);

-- Table: coupon_redemptions
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_email TEXT NOT NULL,
    discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount >= 0),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_order_coupon UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON public.coupon_redemptions(user_id, coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_email ON public.coupon_redemptions(customer_email, coupon_id);

-- ------------------------------------------------------------------------------
-- 6. BAKERY SETTINGS
-- ------------------------------------------------------------------------------

-- Table: bakery_settings
CREATE TABLE IF NOT EXISTS public.bakery_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    business_name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    address TEXT NOT NULL,
    city_state TEXT NOT NULL,
    phone TEXT NOT NULL,
    maps_url TEXT NOT NULL,
    owner_name TEXT,
    email TEXT,
    opening_hours TEXT,
    is_online_ordering_enabled BOOLEAN NOT NULL DEFAULT true,
    is_cod_enabled BOOLEAN NOT NULL DEFAULT true,
    is_online_payment_enabled BOOLEAN NOT NULL DEFAULT true,
    minimum_order_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    free_delivery_threshold NUMERIC(10, 2) NOT NULL DEFAULT 999.00,
    standard_delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
    min_lead_time_hours INT NOT NULL DEFAULT 3,
    max_advance_booking_days INT NOT NULL DEFAULT 30,
    delivery_time_slots JSONB NOT NULL DEFAULT '["10 AM – 1 PM", "1 PM – 4 PM", "4 PM – 7 PM", "7 PM – 10 PM"]'::jsonb,
    serviceable_postal_codes JSONB NOT NULL DEFAULT '["505528", "502103"]'::jsonb,
    sound_notifications_default BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_by UUID REFERENCES public.profiles(id)
);

-- ------------------------------------------------------------------------------
-- 7. SECURITY FUNCTIONS (HARDENED WITH SEARCH_PATH)
-- ------------------------------------------------------------------------------

-- Check if current authenticated user has 'admin' role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Check if current authenticated user has 'staff' or 'admin' role
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'staff')
  );
$$;

-- Secure Guest Order Query (PII Masking & Status Timeline)
CREATE OR REPLACE FUNCTION public.get_guest_order_by_token(
    p_order_number TEXT,
    p_guest_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
    v_timeline JSONB;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_number = p_order_number 
      AND guest_access_token = p_guest_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or invalid access token.';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'product_name', product_name,
            'product_image_url', product_image_url,
            'weight_label', weight_label,
            'egg_preference', egg_preference,
            'custom_message', custom_message,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', total_price
        )
    ) INTO v_items
    FROM public.order_items
    WHERE order_id = v_order.id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'from_status', from_status,
            'to_status', to_status,
            'notes', notes,
            'created_at', created_at
        ) ORDER BY created_at ASC
    ) INTO v_timeline
    FROM public.order_status_history
    WHERE order_id = v_order.id;

    RETURN jsonb_build_object(
        'order_number', v_order.order_number,
        'customer_name', v_order.customer_name,
        'customer_phone', SUBSTRING(v_order.customer_phone, 1, 6) || '***' || SUBSTRING(v_order.customer_phone, LENGTH(v_order.customer_phone) - 2),
        'delivery_street_address', v_order.delivery_street_address,
        'delivery_date', v_order.delivery_date,
        'delivery_time_slot', v_order.delivery_time_slot,
        'status', v_order.status,
        'subtotal_amount', v_order.subtotal_amount,
        'delivery_fee', v_order.delivery_fee,
        'discount_amount', v_order.discount_amount,
        'total_amount', v_order.total_amount,
        'created_at', v_order.created_at,
        'items', COALESCE(v_items, '[]'::jsonb),
        'timeline', COALESCE(v_timeline, '[]'::jsonb)
    );
END;
$$;

-- Retroactive Guest Order Linking upon Email Sign-up
CREATE OR REPLACE FUNCTION public.claim_guest_orders_by_email()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_email TEXT;
    v_count INT;
BEGIN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

    IF v_user_email IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.orders
    SET customer_id = auth.uid()
    WHERE customer_id IS NULL 
      AND LOWER(customer_email) = LOWER(v_user_email);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tag_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bakery_settings ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles are readable by owner or staff" ON public.profiles;
CREATE POLICY "Profiles are readable by owner or staff" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "Profiles are updateable by owner or admin" ON public.profiles;
CREATE POLICY "Profiles are updateable by owner or admin" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin());

-- User Roles Policies (Prevent self-escalation)
DROP POLICY IF EXISTS "User roles readable by user or staff" ON public.user_roles;
CREATE POLICY "User roles readable by user or staff" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "User roles manageable by admin" ON public.user_roles;
CREATE POLICY "User roles manageable by admin" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Addresses Policies
DROP POLICY IF EXISTS "Addresses manageable by owner or admin" ON public.addresses;
CREATE POLICY "Addresses manageable by owner or admin" ON public.addresses
    FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Categories Policies
DROP POLICY IF EXISTS "Active categories are publicly readable" ON public.categories;
CREATE POLICY "Active categories are publicly readable" ON public.categories
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "Categories manageable by admin" ON public.categories;
CREATE POLICY "Categories manageable by admin" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Products Policies
DROP POLICY IF EXISTS "Available products are publicly readable" ON public.products;
CREATE POLICY "Available products are publicly readable" ON public.products
    FOR SELECT TO anon, authenticated
    USING (is_available = true OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "Products manageable by admin" ON public.products;
CREATE POLICY "Products manageable by admin" ON public.products
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Product Variants Policies
DROP POLICY IF EXISTS "Active variants are publicly readable" ON public.product_variants;
CREATE POLICY "Active variants are publicly readable" ON public.product_variants
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "Product variants manageable by admin" ON public.product_variants;
CREATE POLICY "Product variants manageable by admin" ON public.product_variants
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Product Images Policies
DROP POLICY IF EXISTS "Product images are publicly readable" ON public.product_images;
CREATE POLICY "Product images are publicly readable" ON public.product_images
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Product images manageable by admin" ON public.product_images;
CREATE POLICY "Product images manageable by admin" ON public.product_images
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Wishlist Policies
DROP POLICY IF EXISTS "Wishlist items manageable by owner" ON public.wishlist_items;
CREATE POLICY "Wishlist items manageable by owner" ON public.wishlist_items
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Coupons Policies
DROP POLICY IF EXISTS "Active coupons are publicly readable" ON public.coupons;
CREATE POLICY "Active coupons are publicly readable" ON public.coupons
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));

DROP POLICY IF EXISTS "Coupons manageable by admin" ON public.coupons;
CREATE POLICY "Coupons manageable by admin" ON public.coupons
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Orders Policies
DROP POLICY IF EXISTS "Orders are readable by customer or staff" ON public.orders;
CREATE POLICY "Orders are readable by customer or staff" ON public.orders
    FOR SELECT TO authenticated
    USING (customer_id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "Orders are updateable by staff or admin" ON public.orders;
CREATE POLICY "Orders are updateable by staff or admin" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_staff_or_admin());

-- Order Items Policies
DROP POLICY IF EXISTS "Order items are readable by order owner or staff" ON public.order_items;
CREATE POLICY "Order items are readable by order owner or staff" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
              AND (orders.customer_id = auth.uid() OR public.is_staff_or_admin())
        )
    );

-- Payments Policies
DROP POLICY IF EXISTS "Payments are readable by order owner or staff" ON public.payments;
CREATE POLICY "Payments are readable by order owner or staff" ON public.payments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = payments.order_id
              AND (orders.customer_id = auth.uid() OR public.is_staff_or_admin())
        )
    );

-- Order Status History Policies (Strictly accessible by authenticated order owner or staff)
DROP POLICY IF EXISTS "Order status history readable by order owner or staff" ON public.order_status_history;
CREATE POLICY "Order status history readable by order owner or staff" ON public.order_status_history
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_status_history.order_id
              AND (orders.customer_id = auth.uid() OR public.is_staff_or_admin())
        )
    );

-- Coupon Redemptions Policies (Readable by authenticated customer for own usage or staff for reporting)
DROP POLICY IF EXISTS "Coupon redemptions readable by owner or staff" ON public.coupon_redemptions;
CREATE POLICY "Coupon redemptions readable by owner or staff" ON public.coupon_redemptions
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR public.is_staff_or_admin()
    );

-- Bakery Settings Policies
DROP POLICY IF EXISTS "Bakery settings are publicly viewable" ON public.bakery_settings;
CREATE POLICY "Bakery settings are publicly viewable" ON public.bakery_settings
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Bakery settings are updateable by admin" ON public.bakery_settings;
CREATE POLICY "Bakery settings are updateable by admin" ON public.bakery_settings
    FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 9. ATOMIC SERVER-SIDE ORDER CREATION TRANSACTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_securely(
    p_idempotency_key TEXT,
    p_customer_name TEXT,
    p_customer_email TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_delivery_date DATE,
    p_delivery_time_slot TEXT,
    p_special_instructions TEXT,
    p_payment_method public.payment_method_enum,
    p_coupon_code TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_idempotency_key TEXT;
    v_order_id UUID;
    v_order_number TEXT;
    v_guest_token UUID;
    v_subtotal NUMERIC(10, 2) := 0;
    v_delivery_fee NUMERIC(10, 2) := 49.00;
    v_discount NUMERIC(10, 2) := 0;
    v_total NUMERIC(10, 2) := 0;
    v_initial_status public.order_status_enum;
    v_settings public.bakery_settings%ROWTYPE;
    v_item RECORD;
    v_product public.products%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_unit_price NUMERIC(10, 2);
    v_item_total NUMERIC(10, 2);
    v_coupon public.coupons%ROWTYPE;
    v_user_coupon_count INT;
BEGIN
    -- 1. Idempotency Check & Normalization
    v_clean_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

    IF v_clean_idempotency_key IS NOT NULL THEN
        SELECT id, order_number, guest_access_token, total_amount INTO v_order_id, v_order_number, v_guest_token, v_total
        FROM public.orders
        WHERE idempotency_key = v_clean_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'order_id', v_order_id,
                'order_number', v_order_number,
                'guest_access_token', v_guest_token,
                'total', v_total
            );
        END IF;
    END IF;

    -- 2. Validate Cart Not Empty
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Your shopping bag is empty.';
    END IF;

    -- 3. Fetch and Validate Bakery Operating Settings
    SELECT * INTO v_settings FROM public.bakery_settings WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bakery configuration is missing.';
    END IF;

    IF NOT v_settings.is_online_ordering_enabled THEN
        RAISE EXCEPTION 'Online ordering is currently paused by the bakery. Please call us directly.';
    END IF;

    IF p_payment_method = 'cash_on_delivery' AND NOT v_settings.is_cod_enabled THEN
        RAISE EXCEPTION 'Cash on Delivery is currently unavailable.';
    END IF;

    IF p_payment_method = 'razorpay' AND NOT v_settings.is_online_payment_enabled THEN
        RAISE EXCEPTION 'Online payments are currently unavailable.';
    END IF;

    -- 4. Validate Delivery Date & Lead Time
    IF p_delivery_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Delivery date cannot be in the past.';
    END IF;

    IF p_delivery_date > (CURRENT_DATE + v_settings.max_advance_booking_days) THEN
        RAISE EXCEPTION 'Orders can only be scheduled up to % days in advance.', v_settings.max_advance_booking_days;
    END IF;

    -- Validate Delivery Time Slot against Allowed Bakery Slots
    IF p_delivery_time_slot IS NULL OR TRIM(p_delivery_time_slot) = '' THEN
        RAISE EXCEPTION 'Please select a delivery time slot.';
    END IF;

    IF v_settings.delivery_time_slots IS NOT NULL 
       AND jsonb_array_length(v_settings.delivery_time_slots) > 0 
       AND NOT (v_settings.delivery_time_slots ? TRIM(p_delivery_time_slot)) THEN
        RAISE EXCEPTION 'Delivery time slot "%" is not valid or no longer offered. Please select a valid slot.', p_delivery_time_slot;
    END IF;

    -- 5. Validate Line Items, Availability, Eggs, and Multipliers
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id BIGINT,
        weight_label TEXT,
        egg_preference TEXT,
        custom_message TEXT,
        quantity INT
    ) LOOP
        IF v_item.quantity <= 0 OR v_item.quantity > 50 THEN
            RAISE EXCEPTION 'Quantity for each bake must be between 1 and 50.';
        END IF;

        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product with ID % does not exist.', v_item.product_id;
        END IF;

        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'Product "%" is currently sold out.', v_product.name;
        END IF;

        IF v_item.egg_preference = 'Eggless' AND NOT v_product.is_eggless_available THEN
            RAISE EXCEPTION 'Eggless preparation is not available for "%".', v_product.name;
        END IF;
        IF v_item.egg_preference = 'With egg' AND NOT v_product.is_with_egg_available THEN
            RAISE EXCEPTION 'Egg preparation is not available for "%".', v_product.name;
        END IF;

        v_variant := NULL;
        IF v_item.weight_label IS NOT NULL AND TRIM(v_item.weight_label) <> '' THEN
            SELECT * INTO v_variant FROM public.product_variants 
            WHERE product_id = v_item.product_id AND weight_label = TRIM(v_item.weight_label);

            IF FOUND THEN
                IF NOT v_variant.is_active THEN
                    RAISE EXCEPTION 'Weight option "%" for "%" is currently inactive.', v_item.weight_label, v_product.name;
                END IF;
                v_unit_price := ROUND(v_product.base_price * v_variant.price_multiplier);
            ELSE
                RAISE EXCEPTION 'Weight option "%" for "%" does not exist.', v_item.weight_label, v_product.name;
            END IF;
        ELSE
            v_unit_price := v_product.base_price;
        END IF;

        v_item_total := v_unit_price * v_item.quantity;
        v_subtotal := v_subtotal + v_item_total;
    END LOOP;

    -- 6. Validate Minimum Order Value
    IF v_subtotal < v_settings.minimum_order_value THEN
        RAISE EXCEPTION 'Minimum order value is ₹%. Your subtotal is ₹%.', v_settings.minimum_order_value, v_subtotal;
    END IF;

    -- 7. Calculate Delivery Fee
    IF v_subtotal >= v_settings.free_delivery_threshold OR v_subtotal = 0 THEN
        v_delivery_fee := 0.00;
    ELSE
        v_delivery_fee := v_settings.standard_delivery_fee;
    END IF;

    -- 8. Concurrency-Safe Coupon Validation
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon 
        FROM public.coupons 
        WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
        FOR UPDATE;

        IF FOUND THEN
            IF NOT v_coupon.is_active THEN
                RAISE EXCEPTION 'Coupon "%" is currently paused.', p_coupon_code;
            END IF;

            IF v_coupon.valid_from > now() OR (v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < now()) THEN
                RAISE EXCEPTION 'Coupon "%" has expired or is not yet valid.', p_coupon_code;
            END IF;

            IF v_subtotal < v_coupon.min_order_subtotal THEN
                RAISE EXCEPTION 'Coupon "%" requires a minimum subtotal of ₹%.', p_coupon_code, v_coupon.min_order_subtotal;
            END IF;

            IF v_coupon.total_usage_limit IS NOT NULL AND v_coupon.current_usage_count >= v_coupon.total_usage_limit THEN
                RAISE EXCEPTION 'Coupon "%" has reached its maximum global usage limit.', p_coupon_code;
            END IF;

            IF auth.uid() IS NOT NULL THEN
                SELECT COUNT(*) INTO v_user_coupon_count 
                FROM public.coupon_redemptions 
                WHERE coupon_id = v_coupon.id AND user_id = auth.uid();
            ELSE
                SELECT COUNT(*) INTO v_user_coupon_count 
                FROM public.coupon_redemptions 
                WHERE coupon_id = v_coupon.id AND LOWER(customer_email) = LOWER(TRIM(p_customer_email));
            END IF;

            IF v_user_coupon_count >= v_coupon.user_usage_limit THEN
                RAISE EXCEPTION 'You have already reached the usage limit for coupon "%".', p_coupon_code;
            END IF;

            IF v_coupon.discount_type = 'percentage' THEN
                v_discount := ROUND(v_subtotal * (v_coupon.discount_value / 100.0));
                IF v_coupon.max_discount_amount IS NOT NULL AND v_discount > v_coupon.max_discount_amount THEN
                    v_discount := v_coupon.max_discount_amount;
                END IF;
            ELSE
                v_discount := LEAST(v_coupon.discount_value, v_subtotal);
            END IF;

            UPDATE public.coupons 
            SET current_usage_count = current_usage_count + 1 
            WHERE id = v_coupon.id;
        ELSE
            RAISE EXCEPTION 'Coupon code "%" is invalid.', p_coupon_code;
        END IF;
    END IF;

    v_total := GREATEST(0.00, v_subtotal + v_delivery_fee - v_discount);

    -- 9. Determine Initial Order Status
    IF p_payment_method = 'razorpay' AND v_total > 0 THEN
        v_initial_status := 'awaiting_payment';
    ELSE
        v_initial_status := 'placed';
    END IF;

    -- 10. Generate IDs
    v_order_number := 'BC' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6));
    v_guest_token := gen_random_uuid();

    -- 11. Insert Order Record
    INSERT INTO public.orders (
        order_number,
        customer_id,
        guest_access_token,
        idempotency_key,
        customer_name,
        customer_email,
        customer_phone,
        delivery_street_address,
        delivery_date,
        delivery_time_slot,
        special_instructions,
        subtotal_amount,
        delivery_fee,
        discount_amount,
        total_amount,
        status
    ) VALUES (
        v_order_number,
        auth.uid(),
        v_guest_token,
        v_clean_idempotency_key,
        TRIM(p_customer_name),
        LOWER(TRIM(p_customer_email)),
        TRIM(p_customer_phone),
        TRIM(p_delivery_address),
        p_delivery_date,
        p_delivery_time_slot,
        TRIM(p_special_instructions),
        v_subtotal,
        v_delivery_fee,
        v_discount,
        v_total,
        v_initial_status
    ) RETURNING id INTO v_order_id;

    -- 12. Insert Line Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id BIGINT,
        weight_label TEXT,
        egg_preference TEXT,
        custom_message TEXT,
        quantity INT
    ) LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        v_variant := NULL;
        IF v_item.weight_label IS NOT NULL AND TRIM(v_item.weight_label) <> '' THEN
            SELECT * INTO v_variant FROM public.product_variants 
            WHERE product_id = v_item.product_id AND weight_label = TRIM(v_item.weight_label) AND is_active = true;
            IF FOUND THEN
                v_unit_price := ROUND(v_product.base_price * v_variant.price_multiplier);
            ELSE
                v_unit_price := v_product.base_price;
            END IF;
        ELSE
            v_unit_price := v_product.base_price;
        END IF;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            variant_id,
            product_name,
            product_image_url,
            weight_label,
            egg_preference,
            custom_message,
            unit_price,
            quantity,
            total_price
        ) VALUES (
            v_order_id,
            v_product.id,
            v_variant.id,
            v_product.name,
            v_product.image_url,
            v_item.weight_label,
            v_item.egg_preference,
            TRIM(v_item.custom_message),
            v_unit_price,
            v_item.quantity,
            v_unit_price * v_item.quantity
        );
    END LOOP;

    -- 13. Audit Status History
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
    VALUES (v_order_id, NULL, v_initial_status, auth.uid(), 'Initial order creation.');

    -- 14. Record Payment Initialization
    INSERT INTO public.payments (order_id, method, status, amount)
    VALUES (
        v_order_id, 
        p_payment_method, 
        CASE WHEN v_total = 0 THEN 'captured' ELSE 'pending' END, 
        v_total
    );

    -- 15. Record Coupon Redemption
    IF v_coupon.id IS NOT NULL AND v_discount > 0 THEN
        INSERT INTO public.coupon_redemptions (coupon_id, order_id, user_id, customer_email, discount_amount)
        VALUES (v_coupon.id, v_order_id, auth.uid(), LOWER(TRIM(p_customer_email)), v_discount);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'guest_access_token', v_guest_token,
        'status', v_initial_status,
        'total', v_total,
        'requires_online_payment', (p_payment_method = 'razorpay' AND v_total > 0)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. SERVER-SIDE PAYMENT CONFIRMATION (EDGE FUNCTION RPC)
-- ------------------------------------------------------------------------------

-- Called exclusively by the Supabase Edge Function after cryptographic HMAC verification.
-- Never trusted from client requests; direct execution is revoked from public and authenticated.
CREATE OR REPLACE FUNCTION public.confirm_order_payment_verified(
    p_order_id UUID,
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_razorpay_signature TEXT,
    p_payment_status public.payment_status_enum DEFAULT 'captured'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
BEGIN
    -- 1. Fetch and Lock Order Record
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 2. Fetch and Lock Payment Record
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated payment record not found.');
    END IF;

    -- 3. Idempotency Protection: If already captured and order placed, return success immediately
    IF v_payment.status = 'captured' AND v_order.status <> 'awaiting_payment' THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_already_confirmed', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status
        );
    END IF;

    -- 4. Process Payment Capture
    IF p_payment_status = 'captured' THEN
        UPDATE public.payments
        SET status = 'captured',
            razorpay_order_id = COALESCE(p_razorpay_order_id, razorpay_order_id),
            razorpay_payment_id = p_razorpay_payment_id,
            razorpay_signature = p_razorpay_signature,
            updated_at = timezone('utc', now())
        WHERE id = v_payment.id;

        IF v_order.status = 'awaiting_payment' THEN
            UPDATE public.orders
            SET status = 'placed',
                updated_at = timezone('utc', now())
            WHERE id = v_order.id;

            INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
            VALUES (v_order.id, 'awaiting_payment', 'placed', v_order.customer_id, 'Online payment verified and captured via Razorpay.');
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', 'placed'
        );
    ELSE
        -- Record Failed Payment Attempt
        UPDATE public.payments
        SET status = 'failed',
            razorpay_order_id = COALESCE(p_razorpay_order_id, razorpay_order_id),
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = timezone('utc', now())
        WHERE id = v_payment.id;

        IF v_order.status = 'awaiting_payment' THEN
            UPDATE public.orders
            SET status = 'payment_failed',
                updated_at = timezone('utc', now())
            WHERE id = v_order.id;

            INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, notes)
            VALUES (v_order.id, 'awaiting_payment', 'payment_failed', v_order.customer_id, 'Online payment verification failed.');
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', 'payment_failed',
            'error', 'Payment verification failed.'
        );
    END IF;
END;
$$;

-- Restrict direct execution from public and anon: only service_role (Edge Function) can invoke
REVOKE EXECUTE ON FUNCTION public.confirm_order_payment_verified FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment_verified TO service_role;

-- Enable Supabase Realtime for orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
