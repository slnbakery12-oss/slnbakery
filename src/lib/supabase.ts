import { createClient } from '@supabase/supabase-js';

export type AppRole = 'customer' | 'staff' | 'admin';
export type OrderStatus =
  | 'awaiting_payment'
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'payment_failed';

export type PaymentMethod =
  | 'cash_on_delivery'
  | 'razorpay'
  | 'upi_simulation'
  | 'card_simulation';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refund_pending'
  | 'refunded';

export interface DatabaseProduct {
  id: number;
  category_id: string;
  sku: string | null;
  slug: string;
  name: string;
  description: string;
  base_price: number;
  rating: number;
  review_count: number;
  is_bestseller: boolean;
  is_available: boolean;
  is_eggless_available: boolean;
  is_with_egg_available: boolean;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseVariant {
  id: string;
  product_id: number;
  weight_label: string;
  weight_in_grams: number;
  price_multiplier: number;
  calculated_price: number;
  is_active: boolean;
}

export interface DatabaseCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
}

export interface DatabaseOrder {
  id: string;
  order_number: string;
  customer_id: string | null;
  guest_access_token: string;
  idempotency_key: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_street_address: string;
  delivery_date: string;
  delivery_time_slot: string;
  special_instructions: string | null;
  subtotal_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  status: OrderStatus;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatabaseOrderItem {
  id: string;
  order_id: string;
  product_id: number | null;
  variant_id: string | null;
  product_name: string;
  product_image_url: string | null;
  weight_label: string;
  egg_preference: 'Eggless' | 'With egg';
  custom_message: string | null;
  unit_price: number;
  quantity: number;
  total_price: number;
  created_at: string;
}

export interface DatabaseBakerySettings {
  id: number;
  business_name: string;
  tagline: string;
  address: string;
  city_state: string;
  phone: string;
  maps_url: string;
  owner_name: string | null;
  email: string | null;
  opening_hours: string | null;
  is_online_ordering_enabled: boolean;
  is_cod_enabled: boolean;
  is_online_payment_enabled: boolean;
  allow_simulated_payments: boolean;
  minimum_order_value: number;
  free_delivery_threshold: number;
  standard_delivery_fee: number;
  min_lead_time_hours: number;
  max_advance_booking_days: number;
  delivery_time_slots: string[];
  serviceable_postal_codes: string[];
  sound_notifications_default: boolean;
  updated_at: string;
}

export interface DatabaseOrderStatusHistory {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface DatabasePayment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatabaseCouponRedemption {
  id: string;
  coupon_id: string;
  order_id: string;
  user_id: string | null;
  customer_email: string;
  discount_amount: number;
  redeemed_at: string;
}

export interface CreateOrderItemInput {
  product_id: number;
  weight_label: string;
  egg_preference: 'Eggless' | 'With egg';
  custom_message?: string;
  quantity: number;
}

export interface CreateOrderSecurelyParams {
  p_idempotency_key?: string | null;
  p_customer_name: string;
  p_customer_email: string;
  p_customer_phone: string;
  p_delivery_address: string;
  p_delivery_date: string;
  p_delivery_time_slot: string;
  p_special_instructions?: string;
  p_payment_method: PaymentMethod;
  p_coupon_code?: string;
  p_items: CreateOrderItemInput[];
}

export interface CreateOrderSecurelyResult {
  success: boolean;
  order_id: string;
  order_number: string;
  guest_access_token: string;
  status: OrderStatus;
  total: number;
  requires_online_payment: boolean;
  is_duplicate?: boolean;
  error?: string;
}

export interface CreateRazorpayOrderInput {
  order_id: string;
  guest_access_token?: string;
}

export interface CreateRazorpayOrderResult {
  success: boolean;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  order_number: string;
  is_reused?: boolean;
  error?: string;
}

export interface VerifyRazorpayPaymentInput {
  order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  guest_access_token?: string;
}

export interface VerifyRazorpayPaymentResult {
  success: boolean;
  order_id: string;
  order_number: string;
  status: OrderStatus;
  is_already_confirmed?: boolean;
  error?: string;
}

export interface GuestOrderDetails {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_street_address: string;
  delivery_date: string;
  delivery_time_slot: string;
  status: OrderStatus;
  subtotal_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  created_at: string;
  items: Array<{
    product_name: string;
    product_image_url: string | null;
    weight_label: string;
    egg_preference: string;
    custom_message: string | null;
    unit_price: number;
    quantity: number;
    total_price: number;
  }>;
  timeline: Array<{
    from_status: OrderStatus | null;
    to_status: OrderStatus;
    notes: string | null;
    created_at: string;
  }>;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-ref');

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
