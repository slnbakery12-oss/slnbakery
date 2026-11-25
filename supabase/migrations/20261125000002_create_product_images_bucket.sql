-- ==============================================================================
-- SRI LAXMI NARASIMHA BAKERY
-- Migration: 20261125000002_create_product_images_bucket.sql
-- Purpose: Create product-images storage bucket with admin-only upload RLS policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STORAGE BUCKET CONFIGURATION
-- ------------------------------------------------------------------------------
-- Insert or configure the 'product-images' bucket as public, 5 MB limit, and image-only MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB (5 * 1024 * 1024 bytes)
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- ------------------------------------------------------------------------------
-- 2. STORAGE RLS POLICIES FOR product-images BUCKET
-- ------------------------------------------------------------------------------
-- Note: Supabase manages RLS on storage.objects by default.
-- We add bucket-scoped policies without altering global storage.objects RLS state.

-- A. PUBLIC READ: Allow visitors and customers to view product images in storefront
DROP POLICY IF EXISTS "Public can view product images in product-images bucket" ON storage.objects;
CREATE POLICY "Public can view product images in product-images bucket"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- B. ADMIN INSERT: Only authenticated administrators can upload product images
DROP POLICY IF EXISTS "Admins can upload to product-images bucket" ON storage.objects;
CREATE POLICY "Admins can upload to product-images bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
);

-- C. ADMIN UPDATE: Only authenticated administrators can update existing product images
DROP POLICY IF EXISTS "Admins can update objects in product-images bucket" ON storage.objects;
CREATE POLICY "Admins can update objects in product-images bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
);

-- D. ADMIN DELETE: Only authenticated administrators can delete product images
DROP POLICY IF EXISTS "Admins can delete objects in product-images bucket" ON storage.objects;
CREATE POLICY "Admins can delete objects in product-images bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'product-images'
    AND public.is_admin()
);
