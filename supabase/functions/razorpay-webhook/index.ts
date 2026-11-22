// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: razorpay-webhook
// Path: supabase/functions/razorpay-webhook/index.ts
//
// Webhook receiver for asynchronous payment events dispatched by Razorpay.
// Verifies webhook signature header 'x-razorpay-signature' against RAZORPAY_WEBHOOK_SECRET.
// Idempotently marks orders as placed upon 'payment.captured' or 'order.paid'.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawBody);
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const signatureHex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signatureHex.toLowerCase() === signature.trim().toLowerCase();
  } catch (err) {
    console.error("Webhook signature calculation error:", err);
    return false;
  }
}

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
      return new Response("Configuration error", { status: 500 });
    }

    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response("Missing signature header", { status: 400 });
    }

    const rawBody = await req.text();
    const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.warn("Invalid Razorpay webhook signature. Request rejected.");
      return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const paymentEntity = event.payload?.payment?.entity;

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const razorpayPaymentId = paymentEntity?.id;
      const razorpayOrderId = paymentEntity?.order_id;
      const notesOrderId = paymentEntity?.notes?.order_id;

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      // Find order by notes.order_id or razorpay_order_id
      let targetOrderId = notesOrderId;

      if (!targetOrderId && razorpayOrderId) {
        const { data: payRecord } = await supabaseAdmin
          .from("payments")
          .select("order_id")
          .eq("razorpay_order_id", razorpayOrderId)
          .maybeSingle();

        targetOrderId = payRecord?.order_id;
      }

      if (targetOrderId) {
        // Execute idempotent transition
        await supabaseAdmin.rpc("confirm_order_payment_verified", {
          p_order_id: targetOrderId,
          p_razorpay_order_id: razorpayOrderId,
          p_razorpay_payment_id: razorpayPaymentId,
          p_razorpay_signature: signature,
          p_payment_status: "captured",
        });
        console.log(`Webhook successfully processed and captured payment for Order ${targetOrderId}`);
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
