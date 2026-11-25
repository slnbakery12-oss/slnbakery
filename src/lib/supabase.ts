import { createClient } from '@supabase/supabase-js';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import type { Product, BusinessInfo, ProductVariant, Order, CartItem } from '../data';

export type { Session, User, AuthError };

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

export interface DatabaseProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateCustomerProfileInput {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
}

export interface DatabaseAddress {
  id: string;
  user_id: string;
  label: string;
  recipient_name: string;
  phone: string;
  street_address: string;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerAddressInput {
  label?: string;
  recipient_name: string;
  phone: string;
  street_address: string;
  landmark?: string | null;
  city?: string;
  state?: string;
  postal_code?: string;
  is_default?: boolean;
}

export interface UpdateCustomerAddressInput {
  label?: string;
  recipient_name?: string;
  phone?: string;
  street_address?: string;
  landmark?: string | null;
  city?: string;
  state?: string;
  postal_code?: string;
  is_default?: boolean;
}

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
  created_at?: string;
  updated_at?: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminCreateCategoryParams {
  name: string;
  description?: string | null;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface AdminUpdateCategoryParams {
  category_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface AdminCategoryRpcResult {
  success: boolean;
  category?: AdminCategory;
  error?: string;
}

export interface AdminDeleteCategoryResult {
  success: boolean;
  action?: 'deleted';
  category_id?: string;
  category_name?: string;
  product_count?: number;
  message?: string;
  error?: string;
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

// ---------------------------------------------------------------------------
// Supabase Auth Helpers
// ---------------------------------------------------------------------------

/**
 * Sign in an existing user with email and password.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { user: null, session: null, error: new Error('Supabase is not configured.') };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    return { user: null, session: null, error };
  }
  return { user: data.user, session: data.session, error: null };
}

/**
 * Register a new user with email, password, full name, and optional phone.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string,
  phone?: string
): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { user: null, session: null, error: new Error('Supabase is not configured.') };
  }
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();
  const trimmedPhone = phone ? phone.trim() : '';

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        full_name: trimmedName,
        name: trimmedName,
        phone: trimmedPhone,
      },
    },
  });

  if (error) {
    return { user: null, session: null, error };
  }

  if (data.session && data.user && trimmedPhone) {
    try {
      await updateCustomerProfile({ phone: trimmedPhone });
    } catch {
      // Non-blocking profile enrichment
    }
  }

  return { user: data.user, session: data.session, error: null };
}

export interface SendEmailOtpMetadata {
  fullName?: string;
  phone?: string;
  shouldCreateUser?: boolean;
}

export interface SendEmailOtpResult {
  success: boolean;
  error: Error | null;
  message?: string;
}

export interface VerifyEmailOtpResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

/**
 * Send an 8-digit one-time password (OTP) verification email via Supabase Auth.
 * Automatically provisions a new customer account if one does not already exist.
 */
export async function sendEmailOtp(
  email: string,
  metadata?: SendEmailOtpMetadata
): Promise<SendEmailOtpResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: new Error('Supabase is not configured.') };
  }

  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, error: new Error('Please enter a valid email address.') };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { success: false, error: new Error('Please enter a valid email address format (e.g. name@example.com).') };
  }

  const trimmedName = metadata?.fullName?.trim() || '';
  const trimmedPhone = metadata?.phone?.trim() || '';
  const shouldCreateUser = metadata?.shouldCreateUser ?? true;

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser,
        data: {
          full_name: trimmedName || undefined,
          name: trimmedName || undefined,
          phone: trimmedPhone || undefined,
        },
      },
    });

    if (error) {
      const msg = error.message || '';
      if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('security purposes')) {
        return {
          success: false,
          error: new Error('Too many verification requests. Please wait a few moments before trying again.'),
        };
      }
      // If shouldCreateUser is false and user is not registered, do not disclose whether user exists
      if (!shouldCreateUser && (
        msg.toLowerCase().includes('signups not allowed') ||
        msg.toLowerCase().includes('not allowed for otp') ||
        msg.toLowerCase().includes('user not found') ||
        msg.toLowerCase().includes('signup disabled')
      )) {
        return {
          success: true,
          error: null,
          message: `If an account exists for ${normalizedEmail}, an 8-digit verification code has been sent.`,
        };
      }
      return { success: false, error };
    }

    return {
      success: true,
      error: null,
      message: `An 8-digit verification code has been sent to ${normalizedEmail}.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error('Unable to send verification code. Please check your connection.'),
    };
  }
}

/**
 * Verify an 8-digit email OTP token with Supabase Auth.
 * On success, establishes an authenticated session and confirms the email address.
 */
export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<VerifyEmailOtpResult> {
  if (!isSupabaseConfigured) {
    return { user: null, session: null, error: new Error('Supabase is not configured.') };
  }

  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { user: null, session: null, error: new Error('Please enter a valid email address.') };
  }

  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    return { user: null, session: null, error: new Error('Please enter the 8-digit verification code.') };
  }

  const otpRegex = /^\d{8}$/;
  if (!otpRegex.test(cleanToken)) {
    return { user: null, session: null, error: new Error('Verification code must be exactly 8 digits.') };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: cleanToken,
      type: 'email',
    });

    if (error) {
      const msg = error.message || '';
      if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('security purposes') || msg.toLowerCase().includes('too many')) {
        return {
          user: null,
          session: null,
          error: new Error('Too many verification attempts. Please wait a few moments before trying again.'),
        };
      }
      if (msg.toLowerCase().includes('expired')) {
        return {
          user: null,
          session: null,
          error: new Error('The verification code has expired. Please request a new code.'),
        };
      }
      if (
        msg.toLowerCase().includes('invalid') ||
        msg.toLowerCase().includes('token') ||
        msg.toLowerCase().includes('wrong') ||
        msg.toLowerCase().includes('incorrect')
      ) {
        return {
          user: null,
          session: null,
          error: new Error('Incorrect or invalid verification code. Please check your email and try again.'),
        };
      }
      return { user: null, session: null, error };
    }

    if (!data.user) {
      return {
        user: null,
        session: null,
        error: new Error('Verification completed, but no authenticated user was returned. Please try again.'),
      };
    }

    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    return {
      user: null,
      session: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred during code verification.'),
    };
  }
}

/**
 * Sign out the currently authenticated user.
 */
export async function signOut(): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  return { error: error ?? null };
}

/**
 * Retrieve the current active Supabase Auth session and user.
 */
export async function getCurrentSession(): Promise<{
  session: Session | null;
  user: User | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { session: null, user: null, error: null };
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return { session: null, user: null, error };
  }
  return {
    session: data.session,
    user: data.session?.user ?? null,
    error: null,
  };
}

/**
 * Securely fetch the user's assigned roles from the public.user_roles table.
 * Never relies on client metadata or localStorage.
 */
export async function getUserRoles(
  userId: string
): Promise<{ roles: AppRole[]; error: Error | null }> {
  if (!isSupabaseConfigured || !userId) {
    return { roles: [], error: null };
  }
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    return { roles: [], error };
  }

  const roles = (data || []).map((row: { role: AppRole }) => row.role);
  return { roles, error: null };
}

/**
 * Send a password reset email via Supabase Auth.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo?: string
): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { error: new Error('Supabase is not configured.') };
  }
  const destination =
    redirectTo ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : undefined);

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: destination,
  });
  return { error: error ?? null };
}

/**
 * Update the user's password (e.g. after password recovery).
 */
export async function updatePassword(
  newPassword: string
): Promise<{ user: User | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { user: null, error: new Error('Supabase is not configured.') };
  }
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) {
    return { user: null, error };
  }
  return { user: data.user, error: null };
}

/**
 * Retroactively claim previous guest orders matching the authenticated user's verified email.
 * Invokes the security definer function public.claim_guest_orders_by_email().
 */
export async function claimGuestOrders(): Promise<{
  claimedCount: number;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { claimedCount: 0, error: null };
  }
  const { data, error } = await supabase.rpc('claim_guest_orders_by_email');
  if (error) {
    return { claimedCount: 0, error };
  }
  return { claimedCount: typeof data === 'number' ? data : 0, error: null };
}

// ---------------------------------------------------------------------------
// Customer Profile & Address Services (Phase 5.5.2)
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated customer's profile from public.profiles.
 * Strictly scoped to the authenticated user ID.
 */
export async function fetchCustomerProfile(): Promise<{
  profile: DatabaseProfile | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { profile: null, error: new Error('Supabase is not configured.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { profile: null, error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return { profile: null, error: new Error(error.message) };
    }

    if (!data) {
      return { profile: null, error: new Error('Profile not found.') };
    }

    return { profile: data as DatabaseProfile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch customer profile';
    return { profile: null, error: new Error(message) };
  }
}

/**
 * Update the authenticated customer's profile via secure public.update_customer_profile RPC.
 * Enforces server-side authentication (auth.uid()), strict column encapsulation,
 * server-authoritative UTC timestamps, and input validation.
 * Disallows direct modification of id, email, created_at, or updated_at.
 */
export async function updateCustomerProfile(
  input: UpdateCustomerProfileInput
): Promise<{
  profile: DatabaseProfile | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { profile: null, error: new Error('Supabase is not configured.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { profile: null, error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    const trimmedName = input.full_name !== undefined ? input.full_name.trim() : undefined;
    if (trimmedName !== undefined && !trimmedName) {
      return { profile: null, error: new Error('Full name cannot be empty.') };
    }

    const trimmedPhone = input.phone !== undefined ? (input.phone && input.phone.trim() ? input.phone.trim() : null) : undefined;
    const trimmedAvatar = input.avatar_url !== undefined ? (input.avatar_url && input.avatar_url.trim() ? input.avatar_url.trim() : null) : undefined;

    if (trimmedName === undefined && trimmedPhone === undefined && trimmedAvatar === undefined) {
      return { profile: null, error: new Error('No valid profile fields provided for update.') };
    }

    const { data, error } = await supabase.rpc('update_customer_profile', {
      p_full_name: trimmedName ?? null,
      p_phone: trimmedPhone ?? null,
      p_avatar_url: trimmedAvatar ?? null,
      p_update_phone: input.phone !== undefined,
      p_update_avatar_url: input.avatar_url !== undefined,
    });

    if (error) {
      return { profile: null, error: new Error(error.message || 'Failed to update profile.') };
    }

    const rpcResult = data as {
      success: boolean;
      profile?: DatabaseProfile;
      error?: string;
    } | null;

    if (!rpcResult) {
      return { profile: null, error: new Error('Empty response received from profile service.') };
    }

    if (rpcResult.success === false || !rpcResult.profile) {
      return { profile: null, error: new Error(rpcResult.error || 'Failed to update profile.') };
    }

    return { profile: rpcResult.profile, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update customer profile';
    return { profile: null, error: new Error(message) };
  }
}

/**
 * Fetch all saved delivery addresses for the authenticated customer from public.addresses.
 * Strictly scoped to the authenticated user ID.
 */
export async function fetchCustomerAddresses(): Promise<{
  addresses: DatabaseAddress[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { addresses: [], error: new Error('Supabase is not configured.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { addresses: [], error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return { addresses: [], error: new Error(error.message) };
    }

    return { addresses: (data as DatabaseAddress[]) || [], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch customer addresses';
    return { addresses: [], error: new Error(message) };
  }
}

/**
 * Create a new delivery address for the authenticated customer via atomic RPC.
 * Server-enforces ownership by binding user_id to auth.uid() inside create_customer_address.
 * Concurrency serialized with per-user transaction advisory lock to guarantee exactly-one default.
 */
export async function createCustomerAddress(
  input: CreateCustomerAddressInput
): Promise<{
  address: DatabaseAddress | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { address: null, error: new Error('Supabase is not configured.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { address: null, error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    const recipient_name = (input.recipient_name || '').trim();
    const phone = (input.phone || '').trim();
    const street_address = (input.street_address || '').trim();

    if (!recipient_name) {
      return { address: null, error: new Error('Recipient name is required.') };
    }
    if (!phone) {
      return { address: null, error: new Error('Phone number is required.') };
    }
    if (!street_address) {
      return { address: null, error: new Error('Street address is required.') };
    }

    const { data, error } = await supabase.rpc('create_customer_address', {
      p_label: (input.label || 'Home').trim(),
      p_recipient_name: recipient_name,
      p_phone: phone,
      p_street_address: street_address,
      p_landmark: input.landmark && input.landmark.trim() ? input.landmark.trim() : null,
      p_city: (input.city || 'Bejjanki').trim(),
      p_state: (input.state || 'Telangana').trim(),
      p_postal_code: (input.postal_code || '505528').trim(),
      p_is_default: Boolean(input.is_default),
    });

    if (error) {
      return { address: null, error: new Error(error.message || 'Failed to create customer address.') };
    }

    if (!data || typeof data !== 'object') {
      return { address: null, error: new Error('Empty or invalid response received from address service.') };
    }

    const rpcResult = data as {
      success: boolean;
      address?: DatabaseAddress;
      error?: string;
    };

    if (!rpcResult.success || !rpcResult.address) {
      return { address: null, error: new Error(rpcResult.error || 'Failed to create customer address.') };
    }

    return { address: rpcResult.address, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create customer address';
    return { address: null, error: new Error(message) };
  }
}

/**
 * Update an existing delivery address for the authenticated customer via atomic RPC.
 * Strictly scoped by address ID and authenticated user ID inside update_customer_address.
 * Concurrency serialized with per-user transaction advisory lock to guarantee exactly-one default.
 */
export async function updateCustomerAddress(
  addressId: string,
  input: UpdateCustomerAddressInput
): Promise<{
  address: DatabaseAddress | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { address: null, error: new Error('Supabase is not configured.') };
  }

  const cleanAddressId = (addressId || '').trim();
  if (!cleanAddressId) {
    return { address: null, error: new Error('Address ID is required.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { address: null, error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    // Validate non-empty constraints if explicit updates are provided
    if (input.recipient_name !== undefined && !input.recipient_name.trim()) {
      return { address: null, error: new Error('Recipient name cannot be empty.') };
    }
    if (input.phone !== undefined && !input.phone.trim()) {
      return { address: null, error: new Error('Phone number cannot be empty.') };
    }
    if (input.street_address !== undefined && !input.street_address.trim()) {
      return { address: null, error: new Error('Street address cannot be empty.') };
    }

    const hasLandmarkUpdate = input.landmark !== undefined;
    const cleanLandmark = input.landmark && input.landmark.trim() ? input.landmark.trim() : null;

    const { data, error } = await supabase.rpc('update_customer_address', {
      p_address_id: cleanAddressId,
      p_label: input.label !== undefined ? input.label.trim() : null,
      p_recipient_name: input.recipient_name !== undefined ? input.recipient_name.trim() : null,
      p_phone: input.phone !== undefined ? input.phone.trim() : null,
      p_street_address: input.street_address !== undefined ? input.street_address.trim() : null,
      p_landmark: hasLandmarkUpdate ? cleanLandmark : null,
      p_city: input.city !== undefined ? input.city.trim() : null,
      p_state: input.state !== undefined ? input.state.trim() : null,
      p_postal_code: input.postal_code !== undefined ? input.postal_code.trim() : null,
      p_is_default: input.is_default !== undefined ? Boolean(input.is_default) : null,
      p_update_landmark: hasLandmarkUpdate,
    });

    if (error) {
      return { address: null, error: new Error(error.message || 'Failed to update customer address.') };
    }

    if (!data || typeof data !== 'object') {
      return { address: null, error: new Error('Empty or invalid response received from address service.') };
    }

    const rpcResult = data as {
      success: boolean;
      address?: DatabaseAddress;
      error?: string;
    };

    if (!rpcResult.success || !rpcResult.address) {
      return { address: null, error: new Error(rpcResult.error || 'Failed to update customer address.') };
    }

    return { address: rpcResult.address, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update customer address';
    return { address: null, error: new Error(message) };
  }
}

/**
 * Delete a delivery address for the authenticated customer via atomic RPC.
 * Scoped by BOTH address ID and authenticated user ID inside delete_customer_address.
 * Concurrency serialized with per-user transaction advisory lock to guarantee exactly-one default.
 */
export async function deleteCustomerAddress(
  addressId: string
): Promise<{
  success: boolean;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: new Error('Supabase is not configured.') };
  }

  const cleanAddressId = (addressId || '').trim();
  if (!cleanAddressId) {
    return { success: false, error: new Error('Address ID is required.') };
  }

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: new Error(authErr?.message || 'User is not authenticated.') };
    }

    const { data, error } = await supabase.rpc('delete_customer_address', {
      p_address_id: cleanAddressId,
    });

    if (error) {
      return { success: false, error: new Error(error.message || 'Failed to delete customer address.') };
    }

    if (!data || typeof data !== 'object') {
      return { success: false, error: new Error('Empty or invalid response received from address service.') };
    }

    const rpcResult = data as {
      success: boolean;
      deleted_id?: string;
      promoted_id?: string;
      error?: string;
    };

    if (!rpcResult.success) {
      return { success: false, error: new Error(rpcResult.error || 'Failed to delete customer address.') };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete customer address';
    return { success: false, error: new Error(message) };
  }
}

// ---------------------------------------------------------------------------
// Supabase Catalogue & Settings Read Services
// ---------------------------------------------------------------------------

export interface DatabaseProductWithRelations extends DatabaseProduct {
  categories?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  product_variants?: DatabaseVariant[];
}

export interface UpdateProductAvailabilityResponse {
  success: boolean;
  product?: {
    id: number;
    name: string;
    is_available: boolean;
    updated_at: string;
  };
  error?: string;
}

/**
 * Updates a product's is_available status in Supabase via the secure RPC public.update_product_availability.
 * Restricted to authenticated staff and administrators.
 */
export async function updateProductAvailability(
  productId: number,
  isAvailable: boolean
): Promise<{
  data: UpdateProductAvailabilityResponse | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase.rpc('update_product_availability', {
      p_product_id: productId,
      p_is_available: isAvailable,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while updating product availability.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from product availability RPC.') };
    }

    const res = data as UpdateProductAvailabilityResponse;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to update product availability.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while updating product availability.'),
    };
  }
}

export type VariantTemplateKey = 'cake' | 'cupcake_box' | 'cookie_pack' | 'assorted_box' | 'standard';

export interface AdminProductPayload {
  name: string;
  description: string;
  base_price: number;
  category_name: string;
  image_url: string;
  is_available?: boolean;
  is_bestseller?: boolean;
}

export interface AdminCreateProductParams extends AdminProductPayload {
  variant_template?: VariantTemplateKey;
}

export interface AdminUpdateProductParams extends AdminProductPayload {
  product_id: number;
}

export interface AdminProductRpcResult {
  success: boolean;
  error?: string;
  product?: {
    id: number;
    name: string;
    slug: string;
    description: string;
    base_price: number;
    category_id: string;
    category_name: string;
    image_url: string;
    is_available: boolean;
    is_bestseller: boolean;
    created_at: string;
    updated_at: string;
  };
  variants?: DatabaseVariant[];
}

/**
 * Creates a product atomically with initial active variants via public.admin_create_product RPC.
 * Enforces admin authorization on the database.
 */
export async function adminCreateProduct(
  params: AdminCreateProductParams
): Promise<{
  data: AdminProductRpcResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_create_product', {
      p_name: params.name,
      p_description: params.description,
      p_base_price: params.base_price,
      p_category_name: params.category_name,
      p_image_url: params.image_url,
      p_is_available: params.is_available ?? true,
      p_is_bestseller: params.is_bestseller ?? false,
      p_variant_template: params.variant_template ?? 'cake',
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while creating product.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from product creation service.') };
    }

    const res = data as AdminProductRpcResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to create product.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while creating the product.'),
    };
  }
}

/**
 * Updates a product and recalculates its variant prices via public.admin_update_product RPC.
 * Enforces admin authorization on the database.
 */
export async function adminUpdateProduct(
  params: AdminUpdateProductParams
): Promise<{
  data: AdminProductRpcResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_product', {
      p_product_id: params.product_id,
      p_name: params.name,
      p_description: params.description,
      p_base_price: params.base_price,
      p_category_name: params.category_name,
      p_image_url: params.image_url,
      p_is_available: params.is_available ?? true,
      p_is_bestseller: params.is_bestseller ?? false,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while updating product.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from product update service.') };
    }

    const res = data as AdminProductRpcResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to update product.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while updating the product.'),
    };
  }
}

export interface AdminDeleteProductResult {
  success: boolean;
  action?: 'deleted' | 'archived';
  product_id?: number;
  product_name?: string;
  order_count?: number;
  message?: string;
  error?: string;
}

/**
 * Removes or archives a product via public.admin_delete_product RPC.
 * If the product is linked to historical orders, it is archived (marked is_available = false).
 * If the product has no order history, it is permanently deleted.
 * Enforces admin authorization on the database.
 */
export async function adminDeleteProduct(
  productId: number
): Promise<{
  data: AdminDeleteProductResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  if (!productId || productId <= 0) {
    return { data: null, error: new Error('Valid product ID is required.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_delete_product', {
      p_product_id: productId,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while removing product.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from product deletion service.') };
    }

    const res = data as AdminDeleteProductResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to remove product.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while removing the product.'),
    };
  }
}

export interface UploadProductImageResult {
  publicUrl: string | null;
  storagePath: string | null;
  error: Error | null;
}

const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Uploads a product image directly to the 'product-images' Supabase Storage bucket.
 * Enforces file size (<= 5 MB) and MIME types (JPEG, PNG, WebP, AVIF).
 * Generates a unique collision-free path: products/<uuid>.<ext>
 * Uses authenticated client with upsert: false.
 */
export async function uploadProductImage(file: File): Promise<UploadProductImageResult> {
  if (!isSupabaseConfigured) {
    return { publicUrl: null, storagePath: null, error: new Error('Supabase client is not configured.') };
  }

  if (!file) {
    return { publicUrl: null, storagePath: null, error: new Error('No image file selected.') };
  }

  // 1. Validate MIME type
  const normalizedType = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(normalizedType)) {
    return {
      publicUrl: null,
      storagePath: null,
      error: new Error('Unsupported image format. Allowed formats: JPEG, PNG, WebP, AVIF.'),
    };
  }

  // 2. Validate file size (<= 5 MB)
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    return {
      publicUrl: null,
      storagePath: null,
      error: new Error('Image file is too large. Maximum allowed file size is 5 MB.'),
    };
  }

  // 3. Determine extension and generate unique path
  let ext = MIME_TO_EXTENSION[normalizedType];
  if (!ext) {
    const parts = file.name.split('.');
    ext = parts.length > 1 ? parts.pop()?.toLowerCase() || 'jpg' : 'jpg';
  }

  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  const storagePath = `products/${uniqueId}.${ext}`;

  try {
    // 4. Upload to Supabase Storage with upsert: false
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, file, {
        contentType: normalizedType,
        upsert: false,
      });

    if (uploadError) {
      return {
        publicUrl: null,
        storagePath: null,
        error: new Error(uploadError.message || 'Failed to upload image to Supabase Storage.'),
      };
    }

    if (!uploadData?.path) {
      return {
        publicUrl: null,
        storagePath: null,
        error: new Error('Image upload finished but no storage path was returned.'),
      };
    }

    // 5. Retrieve public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(uploadData.path);

    if (!urlData?.publicUrl) {
      return {
        publicUrl: null,
        storagePath: uploadData.path,
        error: new Error('Failed to resolve public URL for uploaded product image.'),
      };
    }

    return {
      publicUrl: urlData.publicUrl,
      storagePath: uploadData.path,
      error: null,
    };
  } catch (err) {
    return {
      publicUrl: null,
      storagePath: null,
      error: err instanceof Error ? err : new Error('Unexpected error occurred during product image upload.'),
    };
  }
}

/**
 * Fetch all products from Supabase along with category information and variant pricing.
 */
export async function fetchProductsWithDetails(): Promise<{
  products: DatabaseProductWithRelations[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { products: [], error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories ( id, name, slug ),
        product_variants ( id, product_id, weight_label, weight_in_grams, price_multiplier, calculated_price, is_active )
      `)
      .order('id', { ascending: true });

    if (error) {
      return { products: [], error };
    }

    return { products: (data as DatabaseProductWithRelations[]) || [], error: null };
  } catch (err) {
    return {
      products: [],
      error: err instanceof Error ? err : new Error('Failed to fetch products from Supabase.'),
    };
  }
}

/**
 * Fetch active categories from Supabase ordered by display order.
 */
export async function fetchCategories(): Promise<{
  categories: DatabaseCategory[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { categories: [], error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      return { categories: [], error };
    }

    return { categories: (data as DatabaseCategory[]) || [], error: null };
  } catch (err) {
    return {
      categories: [],
      error: err instanceof Error ? err : new Error('Failed to fetch categories from Supabase.'),
    };
  }
}

/**
 * Fetch ALL categories (including inactive/hidden) from Supabase ordered by display_order, then name.
 * Used for admin category management and inventory administration.
 */
export async function fetchAdminCategories(): Promise<{
  categories: AdminCategory[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { categories: [], error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return { categories: [], error };
    }

    return { categories: (data as AdminCategory[]) || [], error: null };
  } catch (err) {
    return {
      categories: [],
      error: err instanceof Error ? err : new Error('Failed to fetch admin categories from Supabase.'),
    };
  }
}

/**
 * Creates a category via public.admin_create_category RPC.
 * Automatically generates a collision-resistant URL slug.
 * Serializes concurrent requests using PostgreSQL advisory locks.
 * Enforces admin authorization on the database.
 */
export async function adminCreateCategory(
  params: AdminCreateCategoryParams
): Promise<{
  data: AdminCategoryRpcResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  const cleanName = (params.name || '').trim();
  if (!cleanName) {
    return { data: null, error: new Error('Category name is required.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_create_category', {
      p_name: cleanName,
      p_description: params.description?.trim() || null,
      p_image_url: params.image_url?.trim() || null,
      p_display_order: typeof params.display_order === 'number' ? params.display_order : 0,
      p_is_active: params.is_active ?? true,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while creating category.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from category creation service.') };
    }

    const res = data as AdminCategoryRpcResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to create category.'),
      };
    }

    if (res.success !== true) {
      return {
        data: res,
        error: new Error('Failed to create category: server did not indicate success.'),
      };
    }

    if (!res.category || typeof res.category !== 'object') {
      return {
        data: res,
        error: new Error('Category data was missing from server response.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while creating the category.'),
    };
  }
}

/**
 * Updates a category via public.admin_update_category RPC.
 * Serializes concurrent requests using PostgreSQL advisory locks.
 * Preserves the original category ID and slug.
 * Enforces admin authorization on the database.
 */
export async function adminUpdateCategory(
  params: AdminUpdateCategoryParams
): Promise<{
  data: AdminCategoryRpcResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  const cleanId = (params.category_id || '').trim();
  if (!cleanId) {
    return { data: null, error: new Error('Valid category ID is required.') };
  }

  const cleanName = (params.name || '').trim();
  if (!cleanName) {
    return { data: null, error: new Error('Category name is required.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_category', {
      p_category_id: cleanId,
      p_name: cleanName,
      p_description: params.description?.trim() || null,
      p_image_url: params.image_url?.trim() || null,
      p_display_order: typeof params.display_order === 'number' ? params.display_order : 0,
      p_is_active: params.is_active ?? true,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while updating category.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from category update service.') };
    }

    const res = data as AdminCategoryRpcResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to update category.'),
      };
    }

    if (res.success !== true) {
      return {
        data: res,
        error: new Error('Failed to update category: server did not indicate success.'),
      };
    }

    if (!res.category || typeof res.category !== 'object') {
      return {
        data: res,
        error: new Error('Category data was missing from server response.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while updating the category.'),
    };
  }
}

/**
 * Deletes an unreferenced category via public.admin_delete_category RPC.
 * Rejects deletion if products are currently assigned to the category, returning product_count.
 * Enforces admin authorization on the database.
 */
export async function adminDeleteCategory(
  categoryId: string
): Promise<{
  data: AdminDeleteCategoryResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  const cleanId = (categoryId || '').trim();
  if (!cleanId) {
    return { data: null, error: new Error('Valid category ID is required.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_delete_category', {
      p_category_id: cleanId,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Database error while deleting category.') };
    }

    if (!data || typeof data !== 'object') {
      return { data: null, error: new Error('Unexpected response format from category deletion service.') };
    }

    const res = data as AdminDeleteCategoryResult;
    if (res.success === false) {
      return {
        data: res,
        error: new Error(res.error || 'Failed to delete category.'),
      };
    }

    return { data: res, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('An unexpected error occurred while deleting the category.'),
    };
  }
}

/**
 * Fetch the official bakery settings and operating configuration from Supabase.
 */
export async function fetchBakerySettings(): Promise<{
  settings: DatabaseBakerySettings | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { settings: null, error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabase
      .from('bakery_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      return { settings: null, error };
    }

    return { settings: (data as DatabaseBakerySettings) || null, error: null };
  } catch (err) {
    return {
      settings: null,
      error: err instanceof Error ? err : new Error('Failed to fetch bakery settings from Supabase.'),
    };
  }
}

/**
 * Map a raw database product row into the frontend Product model.
 */
export function mapDatabaseProductToFrontend(
  db: DatabaseProductWithRelations
): Product {
  const categoryName = db.categories?.name || 'All treats';
  const variants: ProductVariant[] = (db.product_variants || []).map(v => ({
    id: v.id,
    product_id: Number(v.product_id),
    weight_label: v.weight_label,
    weight_in_grams: Number(v.weight_in_grams),
    price_multiplier: Number(v.price_multiplier),
    calculated_price: Number(v.calculated_price),
    is_active: Boolean(v.is_active),
  }));

  return {
    id: Number(db.id),
    name: db.name,
    price: Number(db.base_price),
    category: categoryName,
    tags: [categoryName],
    image: db.image_url,
    description: db.description,
    rating: Number(db.rating) || 5.0,
    bestseller: Boolean(db.is_bestseller),
    available: Boolean(db.is_available),
    variants,
    is_eggless_available: Boolean(db.is_eggless_available),
    is_with_egg_available: Boolean(db.is_with_egg_available),
    slug: db.slug,
    category_id: db.category_id,
  };
}

/**
 * Map raw database bakery settings into the frontend BusinessInfo model.
 */
export function mapDatabaseSettingsToBusinessInfo(
  settings: DatabaseBakerySettings
): BusinessInfo {
  return {
    name: settings.business_name,
    tagline: settings.tagline,
    address: settings.address,
    cityState: settings.city_state,
    phone: settings.phone,
    mapsUrl: settings.maps_url,
    ownerName: settings.owner_name || '',
    email: settings.email || '',
    openingHours: settings.opening_hours || '',
    deliveryFee: Number(settings.standard_delivery_fee) || 49,
    freeDeliveryThreshold: Number(settings.free_delivery_threshold) || 999,
    serviceablePostalCodes: settings.serviceable_postal_codes || ['505528', '502103'],
    deliveryTimeSlots: settings.delivery_time_slots || ['10 AM – 1 PM', '1 PM – 4 PM', '4 PM – 7 PM', '7 PM – 10 PM'],
    isOnlineOrderingEnabled: Boolean(settings.is_online_ordering_enabled),
    isCodEnabled: Boolean(settings.is_cod_enabled),
    isOnlinePaymentEnabled: Boolean(settings.is_online_payment_enabled),
    minLeadTimeHours: Number(settings.min_lead_time_hours) || 3,
    maxAdvanceBookingDays: Number(settings.max_advance_booking_days) || 30,
    minimumOrderValue: Number(settings.minimum_order_value) || 0,
  };
}

/**
 * Task 1: Secure Order Creation Helper via public.create_order_securely RPC
 */
export async function createOrderSecurely(
  params: CreateOrderSecurelyParams
): Promise<{ data: CreateOrderSecurelyResult | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('create_order_securely', {
      p_idempotency_key: params.p_idempotency_key ?? null,
      p_customer_name: params.p_customer_name,
      p_customer_email: params.p_customer_email,
      p_customer_phone: params.p_customer_phone,
      p_delivery_address: params.p_delivery_address,
      p_delivery_date: params.p_delivery_date,
      p_delivery_time_slot: params.p_delivery_time_slot,
      p_special_instructions: params.p_special_instructions ?? null,
      p_payment_method: params.p_payment_method,
      p_coupon_code: params.p_coupon_code ?? null,
      p_items: params.p_items,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to create order securely') };
    }

    if (!data) {
      return { data: null, error: new Error('No response returned from order creation service') };
    }

    const result = data as CreateOrderSecurelyResult;
    if (!result.success && result.error) {
      return { data: result, error: new Error(result.error) };
    }

    return { data: result, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred while placing your order';
    return { data: null, error: new Error(message) };
  }
}

/**
 * Status mapping from database order_status_enum to numeric status used in frontend:
 * 0: Order Placed
 * 1: Confirmed
 * 2: Preparing
 * 3: Ready for Pickup
 * 4: Out for Delivery
 * 5: Delivered
 * -1: Rejected / Cancelled / Failed
 */
export function mapOrderStatusToStep(status: OrderStatus | string): number {
  switch (status) {
    case 'placed':
    case 'awaiting_payment':
      return 0;
    case 'confirmed':
      return 1;
    case 'preparing':
      return 2;
    case 'ready_for_pickup':
      return 3;
    case 'out_for_delivery':
      return 4;
    case 'delivered':
      return 5;
    case 'rejected':
    case 'cancelled':
    case 'payment_failed':
      return -1;
    default:
      return 0;
  }
}

/**
 * Maps a database order row + items + payments into the frontend Order model.
 */
export function mapDatabaseOrderToFrontend(
  dbOrder: DatabaseOrder & {
    order_items?: DatabaseOrderItem[];
    payments?: DatabasePayment[];
    order_status_history?: DatabaseOrderStatusHistory[];
  }
): Order {
  const items: CartItem[] = (dbOrder.order_items || []).map((item, idx) => ({
    id: item.product_id ? Number(item.product_id) : idx,
    name: item.product_name,
    price: Number(item.unit_price),
    category: 'Treats',
    tags: [],
    image: item.product_image_url || '/images/strawberry-hero.png',
    description: '',
    rating: 5,
    bestseller: false,
    available: true,
    key: item.id || `item-${idx}`,
    weight: item.weight_label,
    egg: item.egg_preference,
    message: item.custom_message || '',
    qty: Number(item.quantity),
    date: dbOrder.delivery_date,
    unitPrice: Number(item.unit_price),
  }));

  const paymentRecord = dbOrder.payments && dbOrder.payments.length > 0 ? dbOrder.payments[0] : null;
  const paymentMethodLabel = paymentRecord
    ? (paymentRecord.method === 'cash_on_delivery'
        ? 'Cash on delivery'
        : paymentRecord.method === 'razorpay'
        ? 'Online payment'
        : paymentRecord.method)
    : 'Cash on delivery';

  return {
    id: dbOrder.order_number,
    customer: dbOrder.customer_name,
    email: dbOrder.customer_email,
    phone: dbOrder.customer_phone,
    address: dbOrder.delivery_street_address,
    date: dbOrder.delivery_date,
    time: dbOrder.delivery_time_slot,
    payment: paymentMethodLabel,
    instructions: dbOrder.special_instructions || '',
    items,
    total: Number(dbOrder.total_amount),
    subtotal: Number(dbOrder.subtotal_amount),
    deliveryFee: Number(dbOrder.delivery_fee),
    discount: Number(dbOrder.discount_amount),
    paymentStatus: paymentRecord?.status || 'pending',
    timeline: (dbOrder.order_status_history || [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(h => ({
        status: h.to_status,
        notes: h.notes || '',
        created_at: h.created_at,
      })),
    rawStatus: dbOrder.status,
    status: mapOrderStatusToStep(dbOrder.status),
    createdAt: new Date(dbOrder.created_at).getTime(),
    sample: false,
  };
}

/**
 * Fetch authenticated customer orders from Supabase with order items, payment info and status history.
 * Respects RLS (only orders where customer_id = auth.uid() are returned).
 */
export async function fetchCustomerOrders(): Promise<{
  orders: Order[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { orders: [], error: new Error('Supabase is not configured.') };
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        payments (*),
        order_status_history (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { orders: [], error: new Error(error.message) };
    }

    if (!data) {
      return { orders: [], error: null };
    }

    const mapped = (data as (DatabaseOrder & {
      order_items?: DatabaseOrderItem[];
      payments?: DatabasePayment[];
      order_status_history?: DatabaseOrderStatusHistory[];
    })[]).map(mapDatabaseOrderToFrontend);

    return { orders: mapped, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch customer orders';
    return { orders: [], error: new Error(message) };
  }
}

/**
 * Fetch guest order details using order number and guest access token via public.get_guest_order_by_token RPC.
 */
export async function fetchGuestOrderByToken(
  orderNumber: string,
  guestToken: string
): Promise<{ data: GuestOrderDetails | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }

  try {
    const cleanNumber = orderNumber.trim().toUpperCase();
    const cleanToken = guestToken.trim();

    const { data, error } = await supabase.rpc('get_guest_order_by_token', {
      p_order_number: cleanNumber,
      p_guest_token: cleanToken,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Order not found or invalid access token') };
    }

    if (!data) {
      return { data: null, error: new Error('No order details found for this access token.') };
    }

    return { data: data as GuestOrderDetails, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch guest order';
    return { data: null, error: new Error(message) };
  }
}

/**
 * Fetch all orders from Supabase for administrative and staff view.
 * Includes guest orders and authenticated customer orders, with joined order_items,
 * payments, and order_status_history.
 * Sorts newest orders first (created_at descending).
 * Requires authenticated user with admin or staff role (enforced by RLS policy on public.orders).
 */
export async function fetchAdminOrders(): Promise<{
  orders: Order[];
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { orders: [], error: new Error('Supabase is not configured.') };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      return { orders: [], error: new Error('Authentication required to access bakery management orders.') };
    }

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        payments (*),
        order_status_history (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { orders: [], error: new Error(error.message) };
    }

    if (!data) {
      return { orders: [], error: null };
    }

    const mapped = (data as (DatabaseOrder & {
      order_items?: DatabaseOrderItem[];
      payments?: DatabasePayment[];
      order_status_history?: DatabaseOrderStatusHistory[];
    })[]).map(mapDatabaseOrderToFrontend);

    return { orders: mapped, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch admin orders';
    return { orders: [], error: new Error(message) };
  }
}

/**
 * Maps numeric step status from UI to database OrderStatus enum:
 * 1 -> 'confirmed'
 * -1 -> 'rejected'
 * 2 -> 'preparing'
 * 3 -> 'ready_for_pickup'
 * 4 -> 'out_for_delivery'
 * 5 -> 'delivered'
 */
export function mapStepToOrderStatus(step: number): OrderStatus | null {
  switch (step) {
    case 1:
      return 'confirmed';
    case -1:
      return 'rejected';
    case 2:
      return 'preparing';
    case 3:
      return 'ready_for_pickup';
    case 4:
      return 'out_for_delivery';
    case 5:
      return 'delivered';
    case 0:
      return 'placed';
    default:
      return null;
  }
}

export interface UpdateOrderStatusRpcResult {
  success: boolean;
  error?: string;
  order_id?: string;
  order_number?: string;
  previous_status?: OrderStatus;
  status?: OrderStatus;
  notes?: string;
  updated_at?: string;
  message?: string;
}

/**
 * Updates order status in Supabase via public.update_order_status_by_admin RPC.
 * Atomically updates orders.status and appends a row to order_status_history.
 * Enforces staff/admin authorization on the database.
 */
export async function updateOrderStatusByAdmin(
  orderNumber: string,
  newStatusOrStep: number | OrderStatus,
  notes?: string | null
): Promise<{
  data: UpdateOrderStatusRpcResult | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }

  const cleanOrderNumber = orderNumber.trim();
  if (!cleanOrderNumber) {
    return { data: null, error: new Error('Order number is required.') };
  }

  const targetStatus: OrderStatus | null =
    typeof newStatusOrStep === 'number'
      ? mapStepToOrderStatus(newStatusOrStep)
      : newStatusOrStep;

  if (!targetStatus) {
    return { data: null, error: new Error(`Invalid target status: ${newStatusOrStep}`) };
  }

  try {
    const { data, error } = await supabase.rpc('update_order_status_by_admin', {
      p_order_number: cleanOrderNumber,
      p_new_status: targetStatus,
      p_notes: notes?.trim() || null,
    });

    if (error) {
      return { data: null, error: new Error(error.message || 'Failed to update order status.') };
    }

    const rpcResult = data as UpdateOrderStatusRpcResult | null;

    if (!rpcResult) {
      return { data: null, error: new Error('Empty response received from order update service.') };
    }

    if (rpcResult.success === false) {
      return { data: rpcResult, error: new Error(rpcResult.error || 'Failed to update order status.') };
    }

    return { data: rpcResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error during order status update.';
    return { data: null, error: new Error(message) };
  }
}



