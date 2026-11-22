-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Seed Data: supabase/seed.sql
-- ==============================================================================

-- 1. Bakery Settings Configuration
INSERT INTO public.bakery_settings (
    id,
    business_name,
    tagline,
    address,
    city_state,
    phone,
    maps_url,
    owner_name,
    email,
    opening_hours,
    is_online_ordering_enabled,
    is_cod_enabled,
    is_online_payment_enabled,
    minimum_order_value,
    free_delivery_threshold,
    standard_delivery_fee,
    min_lead_time_hours,
    max_advance_booking_days,
    delivery_time_slots,
    serviceable_postal_codes,
    sound_notifications_default
) VALUES (
    1,
    'Sri Laxmi Narasimha Bakery',
    'Baked with love. Always.',
    '9-2-5, Siddipet, Bejjanki, Telangana 505528',
    'Bejjanki, Telangana',
    '07799801078',
    'https://maps.app.goo.gl/eBLLt3mn3tqb87DR9?g_st=iw',
    '',
    '',
    '',
    true,
    true,
    true,
    0.00,
    999.00,
    49.00,
    3,
    30,
    '["10 AM – 1 PM", "1 PM – 4 PM", "4 PM – 7 PM", "7 PM – 10 PM"]'::jsonb,
    '["505528", "502103"]'::jsonb,
    true
) ON CONFLICT (id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    tagline = EXCLUDED.tagline,
    address = EXCLUDED.address,
    city_state = EXCLUDED.city_state,
    phone = EXCLUDED.phone,
    maps_url = EXCLUDED.maps_url;

-- 2. Categories
INSERT INTO public.categories (slug, name, display_order, is_active) VALUES
    ('birthday-cakes', 'Birthday Cakes', 1, true),
    ('anniversary-cakes', 'Anniversary Cakes', 2, true),
    ('wedding-cakes', 'Wedding Cakes', 3, true),
    ('photo-cakes', 'Photo Cakes', 4, true),
    ('chocolate-cakes', 'Chocolate Cakes', 5, true),
    ('butterscotch-cakes', 'Butterscotch Cakes', 6, true),
    ('pastries', 'Pastries', 7, true),
    ('cupcakes', 'Cupcakes', 8, true),
    ('cookies', 'Cookies', 9, true),
    ('breads', 'Breads', 10, true),
    ('puffs', 'Puffs', 11, true),
    ('desserts', 'Desserts', 12, true)
ON CONFLICT (slug) DO NOTHING;

-- 3. Core Catalog Products and Variants
DO $$
DECLARE
    v_cat_bday UUID;
    v_cat_choc UUID;
    v_cat_bscotch UUID;
    v_cat_anniv UUID;
    v_cat_cupcake UUID;
    v_cat_dessert UUID;
    v_cat_cookie UUID;
    v_cat_bread UUID;
    v_prod_id BIGINT;
BEGIN
    SELECT id INTO v_cat_bday FROM public.categories WHERE slug = 'birthday-cakes';
    SELECT id INTO v_cat_choc FROM public.categories WHERE slug = 'chocolate-cakes';
    SELECT id INTO v_cat_bscotch FROM public.categories WHERE slug = 'butterscotch-cakes';
    SELECT id INTO v_cat_anniv FROM public.categories WHERE slug = 'anniversary-cakes';
    SELECT id INTO v_cat_cupcake FROM public.categories WHERE slug = 'cupcakes';
    SELECT id INTO v_cat_dessert FROM public.categories WHERE slug = 'desserts';
    SELECT id INTO v_cat_cookie FROM public.categories WHERE slug = 'cookies';
    SELECT id INTO v_cat_bread FROM public.categories WHERE slug = 'breads';

    -- Product 1: Strawberry Cloud Cake
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_bday, 'CAKE-STRAW-01', 'strawberry-cloud-cake',
        'Strawberry Cloud Cake',
        'Pillowy vanilla sponge, clouds of fresh cream, and a generous layer of juicy strawberries. A little slice of sunshine, made by hand.',
        749.00, 4.9, 128, true, true,
        'https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, '500g', 500, 1.00, 749.00),
        (v_prod_id, '1kg', 1000, 1.90, 1423.00),
        (v_prod_id, '1.5kg', 1500, 2.80, 2097.00),
        (v_prod_id, '2kg', 2000, 3.70, 2771.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 2: Belgian Chocolate Truffle
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_choc, 'CAKE-CHOC-02', 'belgian-chocolate-truffle',
        'Belgian Chocolate Truffle',
        'Rich Belgian chocolate ganache meets moist cocoa sponge. Deeply chocolatey, wonderfully indulgent, and impossible to share.',
        899.00, 4.9, 214, true, true,
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, '500g', 500, 1.00, 899.00),
        (v_prod_id, '1kg', 1000, 1.90, 1708.00),
        (v_prod_id, '1.5kg', 1500, 2.80, 2517.00),
        (v_prod_id, '2kg', 2000, 3.70, 3326.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 3: Golden Butterscotch Bliss
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_bscotch, 'CAKE-BSCOTCH-03', 'golden-butterscotch-bliss',
        'Golden Butterscotch Bliss',
        'Buttery caramel, golden praline crunch, and soft vanilla sponge. A timeless favourite with a little extra magic.',
        699.00, 4.8, 96, true, true,
        'https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, '500g', 500, 1.00, 699.00),
        (v_prod_id, '1kg', 1000, 1.90, 1328.00),
        (v_prod_id, '1.5kg', 1500, 2.80, 1957.00),
        (v_prod_id, '2kg', 2000, 3.70, 2586.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 4: Rose & Vanilla Romance
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_anniv, 'CAKE-ROSE-04', 'rose-vanilla-romance',
        'Rose & Vanilla Romance',
        'Delicate vanilla bean sponge wrapped in rose-kissed buttercream. Elegant, fragrant, and made for your forever moments.',
        999.00, 4.9, 142, true, true,
        'https://images.unsplash.com/photo-1627834377411-8da5f4f09de8?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, '500g', 500, 1.00, 999.00),
        (v_prod_id, '1kg', 1000, 1.90, 1898.00),
        (v_prod_id, '1.5kg', 1500, 2.80, 2797.00),
        (v_prod_id, '2kg', 2000, 3.70, 3696.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 5: Little Cupcake Collection
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_cupcake, 'TREAT-CUP-05', 'little-cupcake-collection',
        'Little Cupcake Collection',
        'A delightful box of six cupcakes with silky buttercream swirls. Small enough for a little treat, lovely enough to make someone’s day.',
        449.00, 4.8, 88, false, true,
        'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, 'Box of 6', 300, 1.00, 449.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 6: Berry Sweet Cheesecake
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_dessert, 'DESS-CHEESE-06', 'berry-sweet-cheesecake',
        'Berry Sweet Cheesecake',
        'Silky baked cream cheese on a golden biscuit base, finished with a bright berry compote. A beautiful balance of creamy and fresh.',
        849.00, 4.9, 110, false, true,
        'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, '500g', 500, 1.00, 849.00),
        (v_prod_id, '1kg', 1000, 1.90, 1613.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 7: Chocolate Chunk Cookies
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_cookie, 'TREAT-COOK-07', 'chocolate-chunk-cookies',
        'Chocolate Chunk Cookies',
        'Crisp edges, a soft centre, and generous chunks of dark chocolate. Six cookies, baked fresh for your afternoon cup.',
        349.00, 4.7, 74, false, true,
        'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, 'Pack of 6', 250, 1.00, 349.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;

    -- Product 8: The Morning Butter Box
    INSERT INTO public.products (
        category_id, sku, slug, name, description, base_price, rating, review_count, is_bestseller, is_available, image_url
    ) VALUES (
        v_cat_bread, 'BREAD-MORN-08', 'the-morning-butter-box',
        'The Morning Butter Box',
        'Golden, flaky, beautifully buttery pastries. Our morning selection of croissants and savoury puffs, baked for slow mornings.',
        399.00, 4.8, 62, false, true,
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85'
    ) ON CONFLICT (slug) DO UPDATE SET base_price = EXCLUDED.base_price RETURNING id INTO v_prod_id;

    INSERT INTO public.product_variants (product_id, weight_label, weight_in_grams, price_multiplier, calculated_price) VALUES
        (v_prod_id, 'Assorted Box', 400, 1.00, 399.00)
    ON CONFLICT (product_id, weight_label) DO NOTHING;
END $$;

-- 4. Active Coupon Code SWEET10
INSERT INTO public.coupons (
    code, description, discount_type, discount_value, min_order_subtotal, is_active
) VALUES (
    'SWEET10',
    '10% off cart subtotal with no minimum spend.',
    'percentage',
    10.00,
    0.00,
    true
) ON CONFLICT (code) DO NOTHING;
