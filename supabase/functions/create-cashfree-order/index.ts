// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Supabase Edge Function: create-cashfree-order
// Path: supabase/functions/create-cashfree-order/index.ts
//
// Generates a server-side Cashfree Order for a validated bakery order awaiting payment.
// Uses durable database-backed reservation mechanism (`reserve_cashfree_order_creation`)
// to prevent concurrent duplicate orders, validates phone numbers and gateway responses,
// releases reservations on immediate failures, and attaches cf_order_id & payment_session_id.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import {
  getCashfreeConfig,
  createCashfreeOrder,
  getCashfreeOrder,
  validateAndFormatIndianPhone,
  validateCashfreeOrderResponse,
  parseInrToPaise,
  isValidInrAmount,
  sanitizeCustomerId,
  sanitizeCustomerName,
  sanitizeCustomerEmail,
  sanitizeCashfreeOrderId,
  validateCreateCashfreeOrderPayload,
  CashfreeOrderRequest,
} from "../_shared/cashfree.ts";

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

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[Configuration] Missing Supabase internal service credentials.");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Database service unreachable." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cashfreeConfig;
    try {
      cashfreeConfig = getCashfreeConfig();
    } catch {
      console.error("[Configuration] Payment gateway credentials not configured.");
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

    const validation = validateCreateCashfreeOrderPayload(payload);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawOrderId = payload.order_id;
    if (typeof rawOrderId !== "string" || !rawOrderId.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: order_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validatedOrderId: string = rawOrderId.trim();
    orderId = validatedOrderId;
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
    // Reserves order creation in Postgres before calling the external Cashfree API.
    // - Locks row FOR UPDATE
    // - Verifies order status is 'awaiting_payment', payment method is 'cashfree', payment status is 'pending'
    // - Validates caller ownership (authenticated user or valid guest_token)
    // - Returns existing Cashfree order ID if already attached
    // - If another request holds an active unexpired reservation, returns locked status
    const { data: reserveResult, error: reserveError } = await supabaseAdmin.rpc(
      "reserve_cashfree_order_creation",
      {
        p_order_id: validatedOrderId,
        p_guest_token: guestAccessToken,
        p_caller_id: callerUserId,
        p_timeout_seconds: 45,
      }
    );

    if (reserveError) {
      console.error("[Database RPC] reserve_cashfree_order_creation failed.", {
        operation: "reserve_order_creation",
        category: "rpc_execution_error",
      });
      return new Response(
        JSON.stringify({ error: "Failed to reserve order creation in database." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A. If already attached to a Cashfree order, return existing order session safely
    if (reserveResult.success && reserveResult.is_already_created) {
      return new Response(
        JSON.stringify({
          success: true,
          is_reused: true,
          cf_order_id: reserveResult.cf_order_id,
          payment_session_id: reserveResult.payment_session_id,
          amount: reserveResult.amount,
          currency: reserveResult.currency,
          order_number: reserveResult.order_number,
          environment: cashfreeConfig.environment,
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
    const orderNumber = reserveResult.order_number;
    const currency = reserveResult.currency || "INR";

    // 3. Strict Pre-Request Amount Validation
    // Pass original database amount directly to parseInrToPaise() without prior coercion.
    const parsedAmountResult = parseInrToPaise(reserveResult.amount);
    if (!parsedAmountResult.valid) {
      console.error("[Validation] Invalid order amount from database reservation.", {
        operation: "validate_reservation_amount",
        category: "invalid_amount",
      });

      // Release reservation safely before exiting
      await supabaseAdmin.rpc("release_cashfree_order_reservation", {
        p_order_id: validatedOrderId,
        p_reservation_token: reservationToken,
      });

      return new Response(
        JSON.stringify({ error: "Unable to initialize payment. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Derive Cashfree numeric order amount strictly from the validated integer paise
    const orderAmount = parsedAmountResult.paise / 100;

    // 4. Fetch customer details from the bakery orders record
    const { data: orderRecord, error: orderFetchError } = await supabaseAdmin
      .from("orders")
      .select("customer_id, customer_name, customer_email, customer_phone")
      .eq("id", validatedOrderId)
      .single();

    if (orderFetchError || !orderRecord) {
      console.error("[Database] Failed to fetch order record details.", {
        operation: "fetch_order_customer",
        category: "query_error",
      });
      // Release reservation so caller can retry
      await supabaseAdmin.rpc("release_cashfree_order_reservation", {
        p_order_id: validatedOrderId,
        p_reservation_token: reservationToken,
      });
      return new Response(
        JSON.stringify({ error: "Failed to retrieve order customer details." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Strict customer phone validation
    const phoneValidation = validateAndFormatIndianPhone(orderRecord.customer_phone);
    if (!phoneValidation.valid || !phoneValidation.phone) {
      console.warn("[Validation] Customer phone format rejected for online payment.", {
        operation: "validate_phone",
        category: "invalid_phone_format",
      });
      // Safe to release reservation because no external gateway call was initiated
      await supabaseAdmin.rpc("release_cashfree_order_reservation", {
        p_order_id: validatedOrderId,
        p_reservation_token: reservationToken,
      });
      return new Response(
        JSON.stringify({ error: phoneValidation.error || "A valid 10-digit Indian mobile number is required to proceed with payment." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = orderRecord.customer_id ||
      (callerUserId ? callerUserId : ("guest_" + sanitizeCustomerId(validatedOrderId.replace(/-/g, "").slice(0, 16))));

    // 6. Construct Cashfree order payload (API v2023-08-01)
    // Note: reservation_token is strictly internal and NEVER sent to Cashfree
    const cfOrderPayload: CashfreeOrderRequest = {
      order_id: sanitizeCashfreeOrderId(orderNumber),
      order_amount: orderAmount,
      order_currency: currency,
      customer_details: {
        customer_id: sanitizeCustomerId(customerId),
        customer_name: sanitizeCustomerName(orderRecord.customer_name),
        customer_email: sanitizeCustomerEmail(orderRecord.customer_email),
        customer_phone: phoneValidation.phone,
      },
      order_note: `Sri Laxmi Narasimha Bakery Order ${orderNumber}`,
      order_tags: {
        bakery_order_id: validatedOrderId,
      },
    };

    // 7. CALL EXTERNAL CASHFREE API
    let cfResult = await createCashfreeOrder(cashfreeConfig, cfOrderPayload);

    // Idempotency recovery: if Cashfree reports the order ID already exists, fetch it
    if (!cfResult.ok && (cfResult.code === "order_already_exists" || cfResult.status === 409)) {
      console.warn("[Cashfree Order Creation] Order already exists on gateway, attempting recovery...", {
        operation: "recover_existing_order",
        status: cfResult.status,
      });
      const getResult = await getCashfreeOrder(cashfreeConfig, cfOrderPayload.order_id);
      if (getResult.ok && getResult.data) {
        cfResult = getResult;
      }
    }

    if (!cfResult.ok || !cfResult.data) {
      console.error("[Cashfree Order Creation] Gateway API request failed.", {
        operation: "create_order",
        status: cfResult.status,
        isTimeout: Boolean(cfResult.isTimeout),
        category: cfResult.isTimeout ? "gateway_timeout" : (cfResult.status >= 500 ? "gateway_server_error" : "gateway_client_error"),
      });

      // Release reservation on failure so user can retry immediately without waiting for timeout
      await supabaseAdmin.rpc("release_cashfree_order_reservation", {
        p_order_id: validatedOrderId,
        p_reservation_token: reservationToken,
      });

      const clientError = cfResult.isTimeout
        ? "Payment gateway request timed out. Please try again."
        : "Unable to initialize payment with payment gateway. Please try again or choose another payment method.";

      return new Response(
        JSON.stringify({ error: clientError }),
        { status: cfResult.status >= 500 ? cfResult.status : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfOrder = cfResult.data;

    // 8. STRICT EXACT AMOUNT & RESPONSE VALIDATION OF RETURNED CASHFREE ORDER
    // Applies equally to newly created orders and orders recovered via getCashfreeOrder
    const orderValidation = validateCashfreeOrderResponse(
      cfOrder,
      cfOrderPayload.order_id,
      orderAmount,
      currency
    );

    if (!orderValidation.valid) {
      console.error("[Cashfree Order Validation] Order validation failed.", {
        operation: "validate_order_response",
        category: "gateway_validation_failure",
      });

      // RESERVATION HANDLING:
      // An order exists on Cashfree whose amount, currency, order_id, or status does not match
      // the bakery database. DO NOT release the reservation immediately.
      // Retaining the reservation until its expiry (45s TTL) prevents immediate looped retries
      // from repeatedly recovering an incompatible gateway order or causing a duplicate checkout race.
      return new Response(
        JSON.stringify({
          error: "Payment initialization verification failed. Please try again in a few moments or choose another payment method.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfOrderId = String(cfOrder.cf_order_id).trim();
    const paymentSessionId = String(cfOrder.payment_session_id).trim();

    // 9. ATTACH CASHFREE ORDER ID & PAYMENT SESSION ID TO PAYMENT RECORD
    const { data: attachResult, error: attachError } = await supabaseAdmin.rpc(
      "attach_cashfree_order_id",
      {
        p_order_id: validatedOrderId,
        p_cf_order_id: cfOrderId,
        p_payment_session_id: paymentSessionId,
        p_reservation_token: reservationToken,
      }
    );

    if (attachError) {
      console.error("[Database RPC] attach_cashfree_order_id failed.", {
        operation: "attach_order_id",
        category: "rpc_execution_error",
      });
      return new Response(
        JSON.stringify({ error: "Failed to attach Cashfree payment reference to order." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!attachResult.success && !attachResult.is_already_attached) {
      console.error("[Database RPC] attach_cashfree_order_id rejected attachment.", {
        operation: "attach_order_id",
        category: "attachment_rejected",
      });
      return new Response(
        JSON.stringify({ error: attachResult.error || "Unable to attach payment reference to order." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success response: return gateway order ID, payment session ID, and environment parameters
    const activeCfOrderId = attachResult.is_already_attached
      ? attachResult.cf_order_id
      : cfOrderId;
    const activePaymentSessionId = attachResult.is_already_attached
      ? attachResult.payment_session_id
      : paymentSessionId;

    return new Response(
      JSON.stringify({
        success: true,
        cf_order_id: activeCfOrderId,
        payment_session_id: activePaymentSessionId,
        order_number: orderNumber,
        amount: orderAmount,
        currency: currency,
        environment: cashfreeConfig.environment,
        is_reused: Boolean(attachResult.is_already_attached),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[Unhandled Exception] create-cashfree-order failed.", {
      operation: "create_cashfree_order",
      category: "unhandled_exception",
      errorType: err instanceof Error ? err.name : "UnknownError",
    });

    // If an active reservation token was created, release it on unhandled crash
    if (orderId && reservationToken && supabaseAdmin) {
      try {
        await supabaseAdmin.rpc("release_cashfree_order_reservation", {
          p_order_id: orderId,
          p_reservation_token: reservationToken,
        });
      } catch {
        console.error("[Database RPC] Failed to release reservation during error handling.");
      }
    }

    // Return a safe generic error message to prevent internal exception leakage
    return new Response(
      JSON.stringify({ error: "Unable to initialize payment. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
