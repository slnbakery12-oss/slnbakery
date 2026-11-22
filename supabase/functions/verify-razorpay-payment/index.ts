// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: verify-razorpay-payment
// Path: supabase/functions/verify-razorpay-payment/index.ts
//
// Cryptographically verifies Razorpay payment signature AND conducts a trusted
// server-to-server API check with Razorpay to verify payment status, amount, and currency.
// Never trusts client parameters. Never marks an order as failed on invalid signatures.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { verifyHmacSha256, validateVerifyPaymentParams } from "../_shared/payment-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase internal service credentials.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Database service unreachable." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in Edge Function environment.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Payment gateway credentials not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Malformed JSON payload in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateVerifyPaymentParams(payload);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      guest_access_token,
    } = payload;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch Order Record
    const { data: order, error: orderFetchError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_id, guest_access_token, status, total_amount")
      .eq("id", order_id)
      .single();

    if (orderFetchError || !order) {
      return new Response(
        JSON.stringify({ error: "Target order does not exist." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Security Check: Customer auth or Guest access token
    const authHeader = req.headers.get("Authorization");
    let isAuthorized = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const userToken = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
      if (user && user.id === order.customer_id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && guest_access_token && guest_access_token === order.guest_access_token) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access: You do not have permission to verify payment for this order." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch Associated Payment Record
    const { data: payment, error: paymentFetchError } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount, method, razorpay_order_id, razorpay_payment_id")
      .eq("order_id", order.id)
      .single();

    if (paymentFetchError || !payment) {
      return new Response(
        JSON.stringify({ error: "No payment record associated with this order." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validate That Stored Razorpay Order ID matches the supplied Razorpay order ID
    if (!payment.razorpay_order_id || payment.razorpay_order_id !== razorpay_order_id) {
      console.warn(`Mismatched Razorpay Order ID. Stored: ${payment.razorpay_order_id}, Received: ${razorpay_order_id}`);
      return new Response(
        JSON.stringify({ error: "Razorpay order ID does not match the payment initialized for this bakery order." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Cryptographic Signature Verification
    const isSignatureValid = await verifyHmacSha256(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpayKeySecret
    );

    if (!isSignatureValid) {
      console.warn(`Cryptographic signature mismatch for Order ${order.id}. Rejecting verification.`);
      // Security rule: Do not transition order to payment_failed on invalid signature
      return new Response(
        JSON.stringify({ error: "Cryptographic signature verification failed. Payment cannot be verified." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Trusted Server-to-Server Razorpay API Fetch
    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const rzpPaymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!rzpPaymentResponse.ok) {
      const errBody = await rzpPaymentResponse.text();
      console.error("Razorpay API payment fetch failed:", errBody);
      return new Response(
        JSON.stringify({ error: "Unable to verify payment status with payment gateway." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rzpPayment = await rzpPaymentResponse.json();

    // 7. Verify Integrity of Server Response
    if (rzpPayment.order_id !== razorpay_order_id) {
      console.error(`Gateway reported different order_id (${rzpPayment.order_id}) than client (${razorpay_order_id})`);
      return new Response(
        JSON.stringify({ error: "Payment gateway mismatch between payment and order reference." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expectedPaise = Math.round(order.total_amount * 100);
    if (rzpPayment.amount !== expectedPaise) {
      console.error(`Gateway reported amount (${rzpPayment.amount}) != expected (${expectedPaise})`);
      return new Response(
        JSON.stringify({ error: "Paid amount does not match order total." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (rzpPayment.currency !== "INR") {
      return new Response(
        JSON.stringify({ error: "Payment currency is not INR." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (rzpPayment.status !== "captured") {
      return new Response(
        JSON.stringify({
          error: `Payment is currently in '${rzpPayment.status}' state, not captured. Please complete authorization.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Execute Database Confirmation RPC
    const { data: confirmResult, error: confirmError } = await supabaseAdmin.rpc(
      "confirm_order_payment_verified",
      {
        p_order_id: order.id,
        p_razorpay_order_id: razorpay_order_id,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_signature: razorpay_signature,
        p_razorpay_webhook_signature: null,
        p_amount_in_paise: expectedPaise,
        p_currency: "INR",
      }
    );

    if (confirmError) {
      console.error("confirm_order_payment_verified RPC execution error:", confirmError);
      return new Response(
        JSON.stringify({ error: "Failed to update order payment status in database." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (confirmResult && !confirmResult.success && !confirmResult.is_already_confirmed) {
      console.error("confirm_order_payment_verified rejected validation:", confirmResult);
      return new Response(
        JSON.stringify({ error: confirmResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        status: confirmResult?.status || "placed",
        is_already_confirmed: confirmResult?.is_already_confirmed || false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unhandled error in verify-razorpay-payment:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
