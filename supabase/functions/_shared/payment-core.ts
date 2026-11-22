// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Shared Core Payment, Cryptographic & Validation Module
// Path: supabase/functions/_shared/payment-core.ts
//
// Shared by Supabase Edge Functions and the Node/Deno test suite.
// Uses standard Web APIs (crypto.subtle, TextEncoder) supported across runtimes.
// ==============================================================================

export interface WebhookExtractionResult {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentAmount?: number; // in paise
  paymentCurrency?: string;
  paymentStatus?: string;
}

/**
 * Validates HMAC-SHA256 signature for Razorpay checkout: HMAC(order_id + "|" + payment_id, secret)
 */
export async function verifyHmacSha256(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }
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
    console.error("verifyHmacSha256 execution error:", err);
    return false;
  }
}

/**
 * Validates HMAC-SHA256 signature for Razorpay Webhooks: HMAC(rawBody, webhookSecret)
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!rawBody || !signature || !secret) {
    return false;
  }
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
    console.error("verifyWebhookSignature execution error:", err);
    return false;
  }
}

/**
 * Extracts and normalizes Razorpay payment information across both 'order.paid' and 'payment.captured' events.
 */
export function extractWebhookPaymentDetails(
  eventType: string,
  event: any
): WebhookExtractionResult {
  let razorpayOrderId: string | undefined;
  let razorpayPaymentId: string | undefined;
  let paymentAmount: number | undefined;
  let paymentCurrency: string | undefined;
  let paymentStatus: string | undefined;

  if (eventType === "order.paid") {
    // In order.paid: payload.order.entity.id is the razorpay_order_id
    // payload.payment.entity contains the payment details
    const orderEntity = event?.payload?.order?.entity;
    const paymentEntity = event?.payload?.payment?.entity;

    razorpayOrderId = orderEntity?.id || paymentEntity?.order_id;
    razorpayPaymentId = paymentEntity?.id;
    paymentAmount = paymentEntity?.amount ?? orderEntity?.amount_paid;
    paymentCurrency = paymentEntity?.currency ?? orderEntity?.currency ?? "INR";
    paymentStatus = paymentEntity?.status ?? "captured";
  } else if (eventType === "payment.captured") {
    // In payment.captured: payload.payment.entity contains both order_id and id
    const paymentEntity = event?.payload?.payment?.entity;

    razorpayOrderId = paymentEntity?.order_id;
    razorpayPaymentId = paymentEntity?.id;
    paymentAmount = paymentEntity?.amount;
    paymentCurrency = paymentEntity?.currency ?? "INR";
    paymentStatus = paymentEntity?.status ?? "captured";
  }

  return {
    razorpayOrderId: razorpayOrderId ? String(razorpayOrderId).trim() : undefined,
    razorpayPaymentId: razorpayPaymentId ? String(razorpayPaymentId).trim() : undefined,
    paymentAmount: typeof paymentAmount === "number" ? paymentAmount : undefined,
    paymentCurrency: paymentCurrency ? String(paymentCurrency).toUpperCase() : undefined,
    paymentStatus: paymentStatus ? String(paymentStatus).toLowerCase() : undefined,
  };
}

/**
 * Validates request payload parameters for create-razorpay-order
 */
export function validateCreateOrderParams(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Missing JSON payload body." };
  }
  if (!payload.order_id || typeof payload.order_id !== "string" || !payload.order_id.trim()) {
    return { valid: false, error: "Missing required parameter: order_id." };
  }
  return { valid: true };
}

/**
 * Validates request payload parameters for verify-razorpay-payment
 */
export function validateVerifyPaymentParams(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Missing JSON payload body." };
  }
  const required = ["order_id", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"];
  for (const field of required) {
    if (!payload[field] || typeof payload[field] !== "string" || !payload[field].trim()) {
      return { valid: false, error: `Missing required payment verification parameter: ${field}.` };
    }
  }
  return { valid: true };
}

/**
 * Converts a standard 12-hour AM/PM delivery time slot (e.g. "10 AM – 1 PM", "12 PM – 3 PM", "12 AM – 3 AM")
 * into 24-hour start and end integers. Handles noon and midnight accurately.
 */
export function parseSlotHours(slotStr: string): { startHour24: number; endHour24: number } | null {
  const match = String(slotStr).trim().match(/^(1[0-2]|[1-9])\s*(AM|PM)\s*[\u2013\u2014\-]\s*(1[0-2]|[1-9])\s*(AM|PM)$/i);
  if (!match) return null;

  let startHour = parseInt(match[1], 10);
  const startMeridian = match[2].toUpperCase();
  let endHour = parseInt(match[3], 10);
  const endMeridian = match[4].toUpperCase();

  // Convert start hour to 24-hour
  if (startMeridian === "PM" && startHour < 12) {
    startHour += 12;
  } else if (startMeridian === "AM" && startHour === 12) {
    startHour = 0; // Midnight
  }

  // Convert end hour to 24-hour
  if (endMeridian === "PM" && endHour < 12) {
    endHour += 12;
  } else if (endMeridian === "AM" && endHour === 12) {
    endHour = 0; // Midnight
  }

  return { startHour24: startHour, endHour24: endHour };
}
