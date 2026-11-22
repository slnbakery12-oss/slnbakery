// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: verify-razorpay-payment
// Path: supabase/functions/verify-razorpay-payment/index.ts
//
// Cryptographically verifies Razorpay payment signatures on the server side
// using the secret RAZORPAY_KEY_SECRET before updating database order status.
// Never trusts client-reported payment success.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Validates the HMAC-SHA256 signature computed from `order_id|payment_id` against Razorpay secret.
 */
async function verifyHmacSha256(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${orderId}|${paymentId}`);
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
    console.error("Cryptographic verification error:", err);
    return false;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
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
    const razorpaySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase internal service credentials.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Database service unreachable." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!razorpaySecret) {
      console.error("Missing RAZORPAY_KEY_SECRET in Edge Function environment.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Payment gateway secret not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      guest_access_token,
    } = payload;

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: "Missing required payment verification parameters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase admin client (privileged execution for RPC)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order record to verify ownership (Customer auth or Guest token)
    const { data: order, error: orderFetchError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, guest_access_token, status, total_amount")
      .eq("id", order_id)
      .single();

    if (orderFetchError || !order) {
      return new Response(
        JSON.stringify({ error: "Target order does not exist." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Security check: Either user is signed in as customer_id OR guest_access_token matches
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

    // Cryptographic signature check
    const isValidSignature = await verifyHmacSha256(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpaySecret
    );

    if (!isValidSignature) {
      console.warn(`Payment signature mismatch for Order ${order_id}. Possible tampering attempt.`);

      // Record failed payment attempt in database idempotently
      await supabaseAdmin.rpc("confirm_order_payment_verified", {
        p_order_id: order_id,
        p_razorpay_order_id: razorpay_order_id,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_signature: razorpay_signature,
        p_payment_status: "failed",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Payment verification failed: Invalid cryptographic signature." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Signature verified successfully -> Execute idempotent state transition
    const { data: confirmResult, error: confirmError } = await supabaseAdmin.rpc(
      "confirm_order_payment_verified",
      {
        p_order_id: order_id,
        p_razorpay_order_id: razorpay_order_id,
        p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_signature: razorpay_signature,
        p_payment_status: "captured",
      }
    );

    if (confirmError) {
      console.error("RPC confirm_order_payment_verified execution error:", confirmError);
      return new Response(
        JSON.stringify({ error: "Failed to persist verified payment state to order." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(confirmResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown internal server error";
    console.error("Unhandled verification exception:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
