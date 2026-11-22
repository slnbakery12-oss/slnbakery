// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: create-razorpay-order
// Path: supabase/functions/create-razorpay-order/index.ts
//
// Generates a server-side Razorpay Order for a validated bakery order awaiting payment.
// Uses durable database-backed reservation mechanism (`reserve_razorpay_order_creation`)
// to prevent competing requests from generating multiple orphan Razorpay orders.
// Releases reservations on immediate API failures and handles concurrency timeouts gracefully.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { validateCreateOrderParams } from "../_shared/payment-core.ts";

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

  let reservationToken: string | null = null;
  let orderId: string | null = null;
  let supabaseAdmin: any = null;

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

    const validation = validateCreateOrderParams(payload);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    orderId = payload.order_id;
    const guestAccessToken = payload.guest_access_token || null;

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Resolve caller authentication (if Bearer token is provided)
    let callerUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const userToken = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
      if (user) {
        callerUserId = user.id;
      }
    }

    // 2. ATOMIC DATABASE RESERVATION:
    // Reserves order creation in Postgres before calling the external Razorpay API.
    // - Locks row FOR UPDATE
    // - Verifies order status is 'awaiting_payment', payment method is 'razorpay', payment status is 'pending'
    // - Validates caller ownership (authenticated user or valid guest_token)
    // - Returns existing order ID if already attached
    // - If another request holds an active unexpired reservation, returns locked status (prevents orphan orders)
    const { data: reserveResult, error: reserveError } = await supabaseAdmin.rpc(
      "reserve_razorpay_order_creation",
      {
        p_order_id: orderId,
        p_guest_token: guestAccessToken,
        p_caller_id: callerUserId,
        p_timeout_seconds: 45,
      }
    );

    if (reserveError) {
      console.error("reserve_razorpay_order_creation RPC failure:", reserveError);
      return new Response(
        JSON.stringify({ error: "Failed to reserve order creation in database." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A. If already attached to a Razorpay order, return the existing order safely
    if (reserveResult.success && reserveResult.is_already_created) {
      return new Response(
        JSON.stringify({
          success: true,
          is_reused: true,
          razorpay_order_id: reserveResult.razorpay_order_id,
          amount: reserveResult.amount_in_paise,
          currency: reserveResult.currency,
          key_id: razorpayKeyId,
          order_number: reserveResult.order_number,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // B. If locked by an active concurrent reservation, reject with 409 Conflict
    if (!reserveResult.success && reserveResult.is_locked) {
      return new Response(
        JSON.stringify({
          error: reserveResult.error,
          is_locked: true,
          retry_after_seconds: reserveResult.retry_after_seconds || 5,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // C. If business validation failed (unauthorized, wrong status, not found)
    if (!reserveResult.success) {
      const statusCode = reserveResult.error?.includes("Unauthorized") ? 403 :
                         reserveResult.error?.includes("not found") ? 404 : 400;
      return new Response(
        JSON.stringify({ error: reserveResult.error }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reservation successfully acquired
    reservationToken = reserveResult.reservation_token;
    const amountInPaise = reserveResult.amount_in_paise;
    const orderNumber = reserveResult.order_number;

    // 3. CALL EXTERNAL RAZORPAY API
    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    let razorpayResponse: Response;

    try {
      razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: orderNumber,
          notes: {
            bakery_order_id: orderId,
            order_number: orderNumber,
            reservation_token: reservationToken,
          },
        }),
      });
    } catch (fetchErr) {
      // Immediate network failure: release reservation so retries are not blocked for 45 seconds
      console.error("Razorpay network fetch failure. Releasing reservation:", fetchErr);
      await supabaseAdmin.rpc("release_razorpay_order_reservation", {
        p_order_id: orderId,
        p_reservation_token: reservationToken,
      });
      return new Response(
        JSON.stringify({ error: "Network timeout communicating with payment gateway." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!razorpayResponse.ok) {
      const errorText = await razorpayResponse.text();
      console.error("Razorpay API order creation failed:", errorText);

      // Release reservation on API rejection so user can retry
      await supabaseAdmin.rpc("release_razorpay_order_reservation", {
        p_order_id: orderId,
        p_reservation_token: reservationToken,
      });

      return new Response(
        JSON.stringify({ error: "Failed to initialize payment with payment gateway.", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const razorpayOrder = await razorpayResponse.json();

    // 4. ATTACH RAZORPAY ORDER ID TO PAYMENT RECORD
    const { data: attachResult, error: attachError } = await supabaseAdmin.rpc("attach_razorpay_order_id", {
      p_order_id: orderId,
      p_razorpay_order_id: razorpayOrder.id,
      p_reservation_token: reservationToken,
    });

    if (attachError) {
      console.error("Failed to execute attach_razorpay_order_id RPC:", attachError);
      return new Response(
        JSON.stringify({ error: "Failed to attach payment reference to order." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!attachResult.success && !attachResult.is_already_attached) {
      console.error("attach_razorpay_order_id rejected attachment:", attachResult);
      return new Response(
        JSON.stringify({ error: attachResult.error }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success response: return gateway order ID, key ID, and payment parameters to client
    const activeRazorpayOrderId = attachResult.is_already_attached
      ? attachResult.razorpay_order_id
      : razorpayOrder.id;

    return new Response(
      JSON.stringify({
        success: true,
        razorpay_order_id: activeRazorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        key_id: razorpayKeyId,
        order_number: orderNumber,
        is_reused: Boolean(attachResult.is_already_attached),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unhandled error in create-razorpay-order:", err);

    // If an active reservation token was created, release it on unhandled crash
    if (orderId && reservationToken && supabaseAdmin) {
      try {
        await supabaseAdmin.rpc("release_razorpay_order_reservation", {
          p_order_id: orderId,
          p_reservation_token: reservationToken,
        });
      } catch (cleanupErr) {
        console.error("Failed to release reservation during error handling:", cleanupErr);
      }
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
