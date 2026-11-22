// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: razorpay-webhook
// Path: supabase/functions/razorpay-webhook/index.ts
//
// Webhook receiver for asynchronous payment events dispatched by Razorpay.
// Verifies webhook signature header 'x-razorpay-signature' against RAZORPAY_WEBHOOK_SECRET.
// Resolves order via stored razorpay_order_id, handles payment.captured and order.paid
// event payloads, validates payload integrity, and idempotently marks order as placed
// via confirm_order_payment_verified.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  verifyWebhookSignature,
  extractWebhookPaymentDetails,
} from "../_shared/payment-core.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

    if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
      console.error("Missing webhook environment configuration.");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing x-razorpay-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.text();
    const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.warn("Invalid Razorpay webhook signature. Request rejected.");
      return new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Malformed JSON payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const eventType = event.event;

    // We process payment.captured and order.paid events
    if (eventType !== "payment.captured" && eventType !== "order.paid") {
      // Return 200 for other ignored events so Razorpay acknowledges delivery
      return new Response(
        JSON.stringify({ status: "ignored", event: eventType }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const details = extractWebhookPaymentDetails(eventType, event);

    if (!details.razorpayOrderId || !details.razorpayPaymentId) {
      console.error("Webhook payload missing order_id or payment_id:", event);
      return new Response(
        JSON.stringify({ error: "Incomplete payment entity in webhook payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (details.paymentCurrency !== "INR" || details.paymentStatus !== "captured") {
      console.warn(
        `Webhook received non-captured or foreign payment: status=${details.paymentStatus}, currency=${details.paymentCurrency}`
      );
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Payment not captured or non-INR" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve bakery order using stored razorpay_order_id in payments table
    const { data: paymentRecord, error: findError } = await supabaseAdmin
      .from("payments")
      .select("order_id, razorpay_order_id, status, amount")
      .eq("razorpay_order_id", details.razorpayOrderId)
      .maybeSingle();

    if (findError) {
      console.error("Database query error finding payment record:", findError);
      return new Response(
        JSON.stringify({ error: "Database lookup failure" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!paymentRecord) {
      console.warn(`No bakery order associated with Razorpay order ID ${details.razorpayOrderId}`);
      // Return 404 so if there is a transient replication delay, Razorpay retries
      return new Response(
        JSON.stringify({ error: "Order not found for given Razorpay order ID" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Execute hardened confirmation RPC
    // Webhook passes p_razorpay_signature: null, p_razorpay_webhook_signature: signature
    const { data: confirmResult, error: confirmError } = await supabaseAdmin.rpc(
      "confirm_order_payment_verified",
      {
        p_order_id: paymentRecord.order_id,
        p_razorpay_order_id: details.razorpayOrderId,
        p_razorpay_payment_id: details.razorpayPaymentId,
        p_razorpay_signature: null,
        p_razorpay_webhook_signature: signature,
        p_amount_in_paise: details.paymentAmount,
        p_currency: details.paymentCurrency,
      }
    );

    if (confirmError) {
      console.error("Webhook confirm_order_payment_verified execution failure:", confirmError);
      return new Response(
        JSON.stringify({ error: "Failed to confirm payment state in database" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (confirmResult && !confirmResult.success && !confirmResult.is_already_confirmed) {
      console.error("RPC returned business validation rejection:", confirmResult);
      return new Response(
        JSON.stringify({ error: confirmResult.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Webhook successfully confirmed payment for Order ${paymentRecord.order_id}`);
    return new Response(
      JSON.stringify({ status: "ok", result: confirmResult }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unhandled webhook processing error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
