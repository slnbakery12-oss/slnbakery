// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Shared Cashfree Payment Gateway Module
// Path: supabase/functions/_shared/cashfree.ts
//
// Shared by Supabase Edge Functions for Cashfree PG integration (API v2023-08-01).
// Provides environment configuration, request helpers, phone validation,
// order validation, typed API clients, and Web API crypto.subtle signature verification.
// ==============================================================================

export type CashfreeEnvironment = "SANDBOX" | "PRODUCTION";

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
  baseUrl: string;
  apiVersion: string;
}

export interface CashfreeCustomerDetails {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

export interface CashfreeOrderRequest {
  order_id: string;
  order_amount: number;
  order_currency: string;
  customer_details: CashfreeCustomerDetails;
  order_note?: string;
  order_meta?: {
    return_url?: string;
    notify_url?: string;
    payment_methods?: string;
  };
  order_tags?: Record<string, string>;
}

export interface CashfreeOrderResponse {
  cf_order_id: string | number;
  order_id: string;
  entity: string;
  order_currency: string;
  order_amount: number;
  order_status: string;
  payment_session_id: string;
  order_expiry_time?: string;
  order_note?: string;
  created_at?: string;
  customer_details?: CashfreeCustomerDetails;
  [key: string]: any;
}

export interface CashfreeApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
  isTimeout?: boolean;
}

export const CASHFREE_API_VERSION = "2023-08-01";
export const CASHFREE_SANDBOX_URL = "https://sandbox.cashfree.com/pg";
export const CASHFREE_PRODUCTION_URL = "https://api.cashfree.com/pg";

/**
 * Resolves the Cashfree base URL based on the environment string.
 * Defaults safely to sandbox unless explicitly set to PRODUCTION.
 */
export function getCashfreeBaseUrl(env?: string | null): string {
  const normalized = (env || "").trim().toUpperCase();
  if (normalized === "PRODUCTION" || normalized === "PROD") {
    return CASHFREE_PRODUCTION_URL;
  }
  return CASHFREE_SANDBOX_URL;
}

/**
 * Resolves Cashfree environment enum value.
 */
export function getCashfreeEnvironment(env?: string | null): CashfreeEnvironment {
  const normalized = (env || "").trim().toUpperCase();
  if (normalized === "PRODUCTION" || normalized === "PROD") {
    return "PRODUCTION";
  }
  return "SANDBOX";
}

/**
 * Loads Cashfree configuration from environment variables.
 * Throws a descriptive error if required API credentials are not configured.
 */
export function getCashfreeConfig(): CashfreeConfig {
  const appId = Deno.env.get("CASHFREE_APP_ID")?.trim();
  const secretKey = Deno.env.get("CASHFREE_SECRET_KEY")?.trim();
  const envVar = Deno.env.get("CASHFREE_ENVIRONMENT")?.trim();

  if (!appId || !secretKey) {
    throw new Error(
      "Missing Cashfree gateway credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) in environment."
    );
  }

  const environment = getCashfreeEnvironment(envVar);
  const baseUrl = getCashfreeBaseUrl(environment);

  return {
    appId,
    secretKey,
    environment,
    baseUrl,
    apiVersion: CASHFREE_API_VERSION,
  };
}

/**
 * Generates standard Cashfree request headers for API v2023-08-01.
 */
export function getCashfreeHeaders(config: CashfreeConfig): Record<string, string> {
  return {
    "x-client-id": config.appId,
    "x-client-secret": config.secretKey,
    "x-api-version": config.apiVersion,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Strict validation and formatting for Indian mobile numbers.
 * - Accepts 10-digit mobile number starting with 6, 7, 8, or 9.
 * - Accepts +91 or 91 country code prefix (12 digits total).
 * - Accepts leading 0 prefix (11 digits total).
 * - Never fabricates placeholder numbers.
 * - Rejects invalid formats, foreign lengths, or non-mobile prefixes.
 */
export function validateAndFormatIndianPhone(phone?: string | null): {
  valid: boolean;
  phone?: string;
  error?: string;
} {
  if (!phone || typeof phone !== "string") {
    return {
      valid: false,
      error: "A valid 10-digit Indian mobile number is required for online payment.",
    };
  }

  // Strip non-digit characters (+, -, spaces, parentheses)
  let digits = phone.replace(/\D/g, "");

  // Handle +91 or 91 country code prefix
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Strict check: exactly 10 digits starting with 6, 7, 8, or 9
  if (/^[6-9]\d{9}$/.test(digits)) {
    return { valid: true, phone: digits };
  }

  return {
    valid: false,
    error: "A valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9) is required.",
  };
}

/**
 * Sanitizes customer identifier for Cashfree (alphanumeric, hyphens, underscores, max 50 chars).
 */
export function sanitizeCustomerId(id?: string | null, fallback = "guest_customer"): string {
  if (!id || !id.trim()) {
    return fallback.slice(0, 50);
  }
  const cleaned = id.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return (cleaned || fallback).slice(0, 50);
}

/**
 * Sanitizes customer display name for Cashfree.
 */
export function sanitizeCustomerName(name?: string | null): string {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.slice(0, 100) : "Bakery Customer";
}

/**
 * Sanitizes customer email for Cashfree.
 */
export function sanitizeCustomerEmail(email?: string | null): string {
  const trimmed = (email || "").trim().toLowerCase();
  if (trimmed && trimmed.includes("@")) {
    return trimmed.slice(0, 100);
  }
  return "orders@srilaxminarasimhabakery.com";
}

/**
 * Sanitizes merchant order identifier (alphanumeric, hyphens, underscores, max 50 chars).
 */
export function sanitizeCashfreeOrderId(orderNumber: string): string {
  const cleaned = orderNumber.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.slice(0, 50);
}

/**
 * Validates request payload parameters for create-cashfree-order.
 */
export function validateCreateCashfreeOrderPayload(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Missing JSON payload body." };
  }
  if (!payload.order_id || typeof payload.order_id !== "string" || !payload.order_id.trim()) {
    return { valid: false, error: "Missing required parameter: order_id." };
  }
  return { valid: true };
}

/**
 * Parses an INR amount into integer paise using its exact decimal string representation.
 * - Accepts positive finite numeric amounts (number or valid decimal numeric string).
 * - Rejects zero, negative values, NaN, and Infinity.
 * - Rejects amounts with more than two decimal places.
 * - Rejects unsupported numeric representations (e.g., scientific notation).
 * - Ensures the resulting paise value is a positive safe integer.
 * - Does not round or silently correct invalid fractional-paise amounts.
 */
export function parseInrToPaise(amount: any): { valid: true; paise: number } | { valid: false; error: string } {
  if (amount === null || amount === undefined || typeof amount === "boolean") {
    return { valid: false, error: "Invalid amount type" };
  }

  let str: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, error: "Amount must be a finite positive number" };
    }
    str = String(amount);
  } else if (typeof amount === "string") {
    str = amount.trim();
  } else {
    return { valid: false, error: "Unsupported amount type" };
  }

  if (!str || str.includes("e") || str.includes("E")) {
    return { valid: false, error: "Unsupported numeric format" };
  }

  // Strict regex: positive integer or decimal with 1 or 2 decimal places, no leading zeros in integer part
  const match = str.match(/^(0|[1-9]\d*)(\.\d{1,2})?$/);
  if (!match) {
    return { valid: false, error: "Amount must have at most two decimal places and no invalid characters" };
  }

  const [rupeesStr, fractionStr = ""] = str.split(".");
  const rupees = parseInt(rupeesStr, 10);
  const fraction = fractionStr.padEnd(2, "0");
  const paiseFromFraction = parseInt(fraction, 10);
  const totalPaise = rupees * 100 + paiseFromFraction;

  if (totalPaise <= 0 || !Number.isSafeInteger(totalPaise)) {
    return { valid: false, error: "Total amount in paise must be a positive safe integer" };
  }

  return { valid: true, paise: totalPaise };
}

/**
 * Validates that an amount is a positive, finite INR numeric amount with at most two decimal places.
 */
export function isValidInrAmount(amount: any): boolean {
  return parseInrToPaise(amount).valid;
}

/**
 * Validates the returned Cashfree order details before attaching to the database.
 * Confirms:
 * 1. Returned order_id matches the requested merchant order ID.
 * 2. Exact decimal amount validation: both expected and returned amounts are parsed
 *    into integer paise using exact decimal string representation and verified for exact equality.
 * 3. Returned order_currency matches the expected currency.
 * 4. cf_order_id is present and non-empty.
 * 5. payment_session_id is present and non-empty.
 * 6. order_status is 'ACTIVE'.
 */
export function validateCashfreeOrderResponse(
  cfOrder: any,
  expectedOrderId: string,
  expectedAmount: number | string,
  expectedCurrency: string
): { valid: boolean; error?: string } {
  if (!cfOrder || typeof cfOrder !== "object") {
    return { valid: false, error: "Invalid order response structure from payment gateway." };
  }

  // 1. Order ID match
  if (!cfOrder.order_id || String(cfOrder.order_id).trim() !== expectedOrderId.trim()) {
    return { valid: false, error: "Gateway order ID mismatch." };
  }

  // 2. Exact decimal amount validation in integer paise
  const expectedParsed = parseInrToPaise(expectedAmount);
  if (!expectedParsed.valid) {
    return { valid: false, error: "Invalid expected order amount." };
  }

  const returnedParsed = parseInrToPaise(cfOrder.order_amount);
  if (!returnedParsed.valid) {
    return { valid: false, error: "Invalid gateway returned order amount." };
  }

  if (expectedParsed.paise !== returnedParsed.paise) {
    return { valid: false, error: "Gateway order amount mismatch." };
  }

  // 3. Currency match
  const returnedCurrency = String(cfOrder.order_currency || "").trim().toUpperCase();
  if (returnedCurrency !== expectedCurrency.trim().toUpperCase()) {
    return { valid: false, error: "Gateway order currency mismatch." };
  }

  // 4. cf_order_id presence
  const cfOrderIdStr = String(cfOrder.cf_order_id || "").trim();
  if (!cfOrderIdStr) {
    return { valid: false, error: "Missing Cashfree gateway order identifier." };
  }

  // 5. payment_session_id presence
  const sessionIdStr = typeof cfOrder.payment_session_id === "string" ? cfOrder.payment_session_id.trim() : "";
  if (!sessionIdStr) {
    return { valid: false, error: "Missing Cashfree checkout payment session ID." };
  }

  // 6. Order status check (must be ACTIVE for new checkout initialization)
  const statusStr = String(cfOrder.order_status || "").trim().toUpperCase();
  if (statusStr !== "ACTIVE") {
    return { valid: false, error: "Gateway order is not in active state." };
  }

  return { valid: true };
}

/**
 * Sends POST /orders request to Cashfree PG API.
 * Uses an AbortController timeout covering the COMPLETE HTTP operation
 * including reading the full response body.
 */
export async function createCashfreeOrder(
  config: CashfreeConfig,
  orderPayload: CashfreeOrderRequest
): Promise<CashfreeApiResult<CashfreeOrderResponse>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const url = `${config.baseUrl}/orders`;
    const response = await fetch(url, {
      method: "POST",
      headers: getCashfreeHeaders(config),
      body: JSON.stringify(orderPayload),
      signal: controller.signal,
    });

    // Read full response body while timeout is still active
    const text = await response.text();
    clearTimeout(timeoutId);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.status >= 500 ? "Cashfree service error" : "Cashfree client error",
        code: typeof parsed?.code === "string" ? parsed.code : undefined,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsed as CashfreeOrderResponse,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = (err instanceof Error && err.name === "AbortError") || controller.signal.aborted;
    return {
      ok: false,
      status: isAbort ? 504 : 500,
      error: isAbort ? "Payment gateway request timed out. Please try again." : "Network failure communicating with payment gateway.",
      isTimeout: isAbort,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches existing order details from Cashfree via GET /orders/{order_id}.
 * Uses an AbortController timeout covering the complete HTTP operation
 * including reading the response body.
 */
export async function getCashfreeOrder(
  config: CashfreeConfig,
  cfOrderId: string
): Promise<CashfreeApiResult<CashfreeOrderResponse>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${config.baseUrl}/orders/${encodeURIComponent(cfOrderId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: getCashfreeHeaders(config),
      signal: controller.signal,
    });

    // Read full response body while timeout is still active
    const text = await response.text();
    clearTimeout(timeoutId);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.status >= 500 ? "Cashfree service error" : "Cashfree client error",
        code: typeof parsed?.code === "string" ? parsed.code : undefined,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsed as CashfreeOrderResponse,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = (err instanceof Error && err.name === "AbortError") || controller.signal.aborted;
    return {
      ok: false,
      status: isAbort ? 504 : 500,
      error: isAbort ? "Payment gateway request timed out. Please try again." : "Network failure fetching Cashfree order.",
      isTimeout: isAbort,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validates HMAC-SHA256 signature for Cashfree Webhooks (API v2023-08-01):
 * Cashfree signs webhooks as: Base64( HMAC-SHA256( timestamp + rawBody, secretKey ) )
 * Headers provided by Cashfree: `x-webhook-timestamp` and `x-webhook-signature`.
 */
export async function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  if (!rawBody || !timestamp || !signature || !secretKey) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const dataToSign = encoder.encode(`${timestamp}${rawBody}`);
    const keyData = encoder.encode(secretKey);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, dataToSign);

    let binary = "";
    const bytes = new Uint8Array(signatureBytes);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const computedBase64 = btoa(binary);

    return computedBase64.trim() === signature.trim();
  } catch {
    console.error("[Cashfree Webhook Signature] Signature verification failed.");
    return false;
  }
}
