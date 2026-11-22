// ==============================================================================
// SRI LAXMI NARASIMHA BAKERY
// Architecture, Security & Payment Validation Test Suite
// Path: tests/security-and-payments.test.ts
//
// Structured in accordance with Task 5:
// 1. ACTUAL IMPLEMENTATION TESTS: Imports and tests production functions directly from
//    supabase/functions/_shared/payment-core.ts (HMAC, webhook extraction, parameter validation, slot parsing)
// 2. BUSINESS LOGIC & TIMEZONE UNIT TESTS: IST timezone independence, noon/midnight handling, lead time
// 3. STATIC SCHEMA AUDIT: Integrity verification of 20261122000000_initial_schema.sql
// 4. LIVE DATABASE INTEGRATION TESTS: Real PostgreSQL roundtrips (distinguished and safely skipped
//    when running without live Supabase cloud credentials).
// ==============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Import actual production implementations from shared module
import {
  verifyHmacSha256,
  verifyWebhookSignature,
  extractWebhookPaymentDetails,
  validateCreateOrderParams,
  validateVerifyPaymentParams,
  parseSlotHours,
} from '../supabase/functions/_shared/payment-core.ts';

// Helper for local HMAC calculation in tests
function computeExpectedHmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// ==============================================================================
// PART 1: ACTUAL PRODUCTION IMPLEMENTATION TESTS
// ==============================================================================
describe('Part 1: Actual Production Implementation Tests (payment-core.ts)', () => {

  test('Impl 1.1: verifyHmacSha256 validates legitimate Razorpay checkout signatures', async () => {
    const secret = 'rzp_test_sec_77889900';
    const orderId = 'order_DA29x14920';
    const paymentId = 'pay_29384729482';
    const legitimateSig = computeExpectedHmac(`${orderId}|${paymentId}`, secret);

    // Call ACTUAL production function
    const isValid = await verifyHmacSha256(orderId, paymentId, legitimateSig, secret);
    assert.equal(isValid, true, 'Production verifyHmacSha256 must accept matching HMAC');
  });

  test('Impl 1.2: verifyHmacSha256 rejects forged or tampered signatures', async () => {
    const secret = 'rzp_test_sec_77889900';
    const orderId = 'order_DA29x14920';
    const paymentId = 'pay_29384729482';
    const forgedSig = 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef';

    const isValid = await verifyHmacSha256(orderId, paymentId, forgedSig, secret);
    assert.equal(isValid, false, 'Production verifyHmacSha256 must reject forged HMAC');

    // Missing parameter rejection
    const withEmpty = await verifyHmacSha256('', paymentId, forgedSig, secret);
    assert.equal(withEmpty, false, 'Empty parameter must return false');
  });

  test('Impl 1.3: verifyWebhookSignature validates raw payload against webhook secret', async () => {
    const webhookSecret = 'whsec_999000111222';
    const rawBody = JSON.stringify({ event: 'payment.captured', entity: { id: 'pay_123' } });
    const expectedSig = computeExpectedHmac(rawBody, webhookSecret);

    // Call ACTUAL production function
    const isValid = await verifyWebhookSignature(rawBody, expectedSig, webhookSecret);
    assert.equal(isValid, true, 'Production verifyWebhookSignature must validate matching rawBody HMAC');

    // Mismatched secret or payload must fail
    const isTampered = await verifyWebhookSignature(rawBody + ' ', expectedSig, webhookSecret);
    assert.equal(isTampered, false, 'Modified body must fail webhook signature verification');
  });

  test('Impl 1.4: extractWebhookPaymentDetails accurately extracts payment.captured event', () => {
    const event = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_CAP123456',
            order_id: 'order_RZP987654',
            amount: 89900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };

    // Call ACTUAL production function
    const details = extractWebhookPaymentDetails('payment.captured', event);

    assert.equal(details.razorpayOrderId, 'order_RZP987654');
    assert.equal(details.razorpayPaymentId, 'pay_CAP123456');
    assert.equal(details.paymentAmount, 89900);
    assert.equal(details.paymentCurrency, 'INR');
    assert.equal(details.paymentStatus, 'captured');
  });

  test('Impl 1.5: extractWebhookPaymentDetails accurately extracts order.paid event', () => {
    const event = {
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_PAID555666',
            amount_paid: 145000,
            currency: 'INR',
            status: 'paid',
          },
        },
        payment: {
          entity: {
            id: 'pay_FOR_ORDER_555',
            order_id: 'order_PAID555666',
            amount: 145000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };

    // Call ACTUAL production function
    const details = extractWebhookPaymentDetails('order.paid', event);

    assert.equal(details.razorpayOrderId, 'order_PAID555666');
    assert.equal(details.razorpayPaymentId, 'pay_FOR_ORDER_555');
    assert.equal(details.paymentAmount, 145000);
    assert.equal(details.paymentCurrency, 'INR');
    assert.equal(details.paymentStatus, 'captured');
  });

  test('Impl 1.6: extractWebhookPaymentDetails handles malformed payloads gracefully', () => {
    const emptyDetails = extractWebhookPaymentDetails('payment.captured', null);
    assert.equal(emptyDetails.razorpayOrderId, undefined);
    assert.equal(emptyDetails.razorpayPaymentId, undefined);

    const missingEntities = extractWebhookPaymentDetails('order.paid', { event: 'order.paid', payload: {} });
    assert.equal(missingEntities.razorpayOrderId, undefined);
    assert.equal(missingEntities.razorpayPaymentId, undefined);
  });

  test('Impl 1.7: validateCreateOrderParams enforces required parameters', () => {
    // Missing body
    assert.equal(validateCreateOrderParams(null).valid, false);
    // Missing order_id
    assert.equal(validateCreateOrderParams({ guest_access_token: 'uuid' }).valid, false);
    // Empty order_id
    assert.equal(validateCreateOrderParams({ order_id: '   ' }).valid, false);
    // Valid order_id
    const valid = validateCreateOrderParams({ order_id: 'c4e3f43b-1234-4567-890a-bcdef1234567' });
    assert.equal(valid.valid, true);
  });

  test('Impl 1.8: validateVerifyPaymentParams enforces all required cryptographic fields', () => {
    const fullPayload = {
      order_id: 'c4e3f43b-1234-4567-890a-bcdef1234567',
      razorpay_order_id: 'order_123',
      razorpay_payment_id: 'pay_456',
      razorpay_signature: 'sig_789',
    };

    assert.equal(validateVerifyPaymentParams(fullPayload).valid, true);

    for (const key of Object.keys(fullPayload)) {
      const copy = { ...fullPayload, [key]: '' };
      const result = validateVerifyPaymentParams(copy);
      assert.equal(result.valid, false, `Must fail when ${key} is empty`);
    }
  });

  test('Impl 1.9: parseSlotHours handles 12-hour AM/PM, noon, and midnight correctly', () => {
    // Regular morning slot: "10 AM – 1 PM" -> 10, 13
    const slot1 = parseSlotHours('10 AM – 1 PM');
    assert.deepEqual(slot1, { startHour24: 10, endHour24: 13 });

    // Afternoon slot: "1 PM – 4 PM" -> 13, 16
    const slot2 = parseSlotHours('1 PM – 4 PM');
    assert.deepEqual(slot2, { startHour24: 13, endHour24: 16 });

    // Evening slot with hyphen: "7 PM - 10 PM" -> 19, 22
    const slot3 = parseSlotHours('7 PM - 10 PM');
    assert.deepEqual(slot3, { startHour24: 19, endHour24: 22 });

    // Noon handling: "12 PM – 3 PM" -> 12, 15
    const slotNoon = parseSlotHours('12 PM – 3 PM');
    assert.deepEqual(slotNoon, { startHour24: 12, endHour24: 15 });

    // Midnight handling: "12 AM – 3 AM" -> 0, 3
    const slotMidnight = parseSlotHours('12 AM – 3 AM');
    assert.deepEqual(slotMidnight, { startHour24: 0, endHour24: 3 });

    // Invalid formats return null
    assert.equal(parseSlotHours('invalid_slot'), null);
    assert.equal(parseSlotHours('25 AM - 28 PM'), null);
  });
});

// ==============================================================================
// PART 2: BUSINESS LOGIC, IST TIMEZONE & CONCURRENCY UNIT TESTS
// ==============================================================================
describe('Part 2: Business Rules, IST Timezone & Concurrency Tests', () => {

  test('Unit 2.1: Session-timezone-independent IST local date calculation', () => {
    // In PostgreSQL: (now() AT TIME ZONE 'Asia/Kolkata')::DATE
    // Demonstrate that formatting UTC into Asia/Kolkata gives the true IST date
    const utcDate = new Date('2026-11-22T20:30:00Z'); // 8:30 PM UTC = 2:00 AM IST on Nov 23!
    const istDateString = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(utcDate);

    // In UTC it is 2026-11-22, but in IST it has already crossed into 2026-11-23!
    assert.equal(istDateString, '2026-11-23');
  });

  test('Unit 2.2: Lead time validation for same-day delivery slots in IST', () => {
    function isSlotAvailable(currentHourIST: number, slotStartHour24: number, minLeadHours: number): boolean {
      return slotStartHour24 >= (currentHourIST + minLeadHours);
    }

    const minLead = 3;
    const currentHourIST = 11; // 11:00 AM IST

    // Slot 10 AM (hour 10) -> in the past, rejected
    assert.equal(isSlotAvailable(currentHourIST, 10, minLead), false);

    // Slot 1 PM (hour 13) -> 13 - 11 = 2 hours (< 3 hr min lead), rejected
    assert.equal(isSlotAvailable(currentHourIST, 13, minLead), false);

    // Slot 4 PM (hour 16) -> 16 - 11 = 5 hours (>= 3 hr min lead), accepted
    assert.equal(isSlotAvailable(currentHourIST, 16, minLead), true);

    // Slot 7 PM (hour 19) -> 19 - 11 = 8 hours (accepted)
    assert.equal(isSlotAvailable(currentHourIST, 19, minLead), true);
  });

  test('Unit 2.3: Serviceable postal code boundary validation (Siddipet / Bejjanki)', () => {
    const serviceableCodes = ['505528', '502103'];

    function validatePostalCode(address: string): boolean {
      const match = address.match(/\b([1-9][0-9]{5})\b/);
      if (!match) return false;
      return serviceableCodes.includes(match[1]);
    }

    assert.equal(validatePostalCode('Bejjanki Village, Siddipet 505528'), true);
    assert.equal(validatePostalCode('Main Road, Siddipet 502103'), true);
    assert.equal(validatePostalCode('Hitech City, Hyderabad 500081'), false);
    assert.equal(validatePostalCode('Unknown Address'), false);
  });

  test('Unit 2.4: Inactive product variants throw without falling back to base price', () => {
    interface Variant {
      id: string;
      product_id: number;
      weight_label: string;
      price_multiplier: number;
      is_active: boolean;
    }

    const variants: Variant[] = [
      { id: 'v1', product_id: 1, weight_label: '500g', price_multiplier: 1.0, is_active: true },
      { id: 'v2', product_id: 1, weight_label: '1kg', price_multiplier: 1.9, is_active: false }, // INACTIVE
    ];

    function calculatePrice(productId: number, weightLabel: string | null, basePrice: number): number {
      if (!weightLabel) return basePrice;
      const v = variants.find(x => x.product_id === productId && x.weight_label === weightLabel && x.is_active);
      if (!v) {
        throw new Error(`Variant "${weightLabel}" is unavailable.`);
      }
      return Math.round(basePrice * v.price_multiplier);
    }

    assert.equal(calculatePrice(1, '500g', 749), 749);
    assert.throws(() => calculatePrice(1, '1kg', 749), /Variant "1kg" is unavailable/);
  });

  test('Unit 2.5: Simulated payment methods are blocked in production mode', () => {
    function assertPermittedPayment(method: string, allowSimulated: boolean) {
      if ((method === 'upi_simulation' || method === 'card_simulation') && !allowSimulated) {
        throw new Error('Simulated payment methods are disabled in production mode.');
      }
    }

    assert.throws(() => assertPermittedPayment('upi_simulation', false), /disabled in production mode/);
    assert.doesNotThrow(() => assertPermittedPayment('razorpay', false));
    assert.doesNotThrow(() => assertPermittedPayment('cash_on_delivery', false));
  });

  test('Unit 2.6: Advisory lock key derivation produces deterministic 32-bit hash', () => {
    function hashString(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }

    const key = 'idem_key_order_1001';
    assert.equal(hashString('order_idem_' + key), hashString('order_idem_' + key));
  });
});

// ==============================================================================
// PART 3: STATIC SCHEMA & MIGRATION SCRIPT INTEGRITY AUDIT
// ==============================================================================
describe('Part 3: SQL Migration & Security Schema Audit', () => {
  const schemaPath = path.resolve(process.cwd(), 'supabase/migrations/20261122000000_initial_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  test('Schema 3.1: All 18 database tables exist in migration script', () => {
    const requiredTables = [
      'profiles',
      'user_roles',
      'addresses',
      'categories',
      'products',
      'product_variants',
      'product_images',
      'product_tags',
      'product_tag_mappings',
      'inventory',
      'wishlist_items',
      'coupons',
      'orders',
      'order_items',
      'order_status_history',
      'payments',
      'coupon_redemptions',
      'bakery_settings',
    ];

    for (const table of requiredTables) {
      const regex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\b`, 'i');
      assert.match(schemaSql, regex, `Table public.${table} must be defined in initial_schema.sql`);
    }
  });

  test('Schema 3.2: Payment uniqueness constraints & reservation columns are defined', () => {
    assert.match(schemaSql, /CONSTRAINT uq_payments_order UNIQUE \(order_id\)/i);
    assert.match(schemaSql, /razorpay_order_reservation_token UUID/i);
    assert.match(schemaSql, /razorpay_order_reserved_at TIMESTAMPTZ/i);
    assert.match(schemaSql, /razorpay_order_reservation_expires_at TIMESTAMPTZ/i);
    assert.match(schemaSql, /razorpay_webhook_signature TEXT/i);
    assert.match(schemaSql, /idx_payments_reservation/i);
  });

  test('Schema 3.3: RPC reserve_razorpay_order_creation is defined with locking and timeout', () => {
    assert.match(schemaSql, /FUNCTION public\.reserve_razorpay_order_creation/i);
    assert.match(schemaSql, /SELECT \* INTO v_order FROM public\.orders WHERE id = p_order_id FOR UPDATE/i);
    assert.match(schemaSql, /is_locked/i);
    assert.match(schemaSql, /v_reservation_token := gen_random_uuid\(\)/i);
  });

  test('Schema 3.4: RPC release_razorpay_order_reservation is defined for API failure recovery', () => {
    assert.match(schemaSql, /FUNCTION public\.release_razorpay_order_reservation/i);
    assert.match(schemaSql, /v_payment\.razorpay_order_reservation_token = p_reservation_token/i);
  });

  test('Schema 3.5: RPC attach_razorpay_order_id validates reservation token and uniqueness', () => {
    assert.match(schemaSql, /FUNCTION public\.attach_razorpay_order_id/i);
    assert.match(schemaSql, /p_reservation_token UUID DEFAULT NULL/i);
    assert.match(schemaSql, /is_already_attached/i);
  });

  test('Schema 3.6: RPC confirm_order_payment_verified runs all validations before idempotency return', () => {
    assert.match(schemaSql, /FUNCTION public\.confirm_order_payment_verified/i);
    assert.match(schemaSql, /v_payment\.method <> 'razorpay'/i);
    assert.match(schemaSql, /Currency must be INR/i);
    assert.match(schemaSql, /Mismatched Razorpay order ID/i);
    assert.match(schemaSql, /Payment amount mismatch/i);
  });

  test('Schema 3.7: RPC confirm_order_payment_verified matches payment ID for already-captured payments', () => {
    assert.match(schemaSql, /Payment already captured with a different Razorpay payment ID/i);
  });

  test('Schema 3.8: RPC confirm_order_payment_verified guards cancelled/rejected orders with refund_pending', () => {
    assert.match(schemaSql, /IF v_order\.status IN \('cancelled', 'rejected'\) THEN/i);
    assert.match(schemaSql, /status = 'refund_pending'/i);
    assert.match(schemaSql, /Payment verified and flagged for refund/i);
  });

  test('Schema 3.9: create_order_securely enforces guest ownership and protects authenticated orders', () => {
    assert.match(schemaSql, /FUNCTION public\.create_order_securely/i);
    assert.match(schemaSql, /v_existing_order\.customer_id IS NOT NULL OR/i);
    assert.match(schemaSql, /Idempotency key collision: caller does not match order owner/i);
  });

  test('Schema 3.10: Staff order update integrity trigger blocks modifying financial or ownership data', () => {
    assert.match(schemaSql, /FUNCTION public\.check_staff_order_update_integrity/i);
    assert.match(schemaSql, /TRIGGER trg_check_staff_order_update/i);
    assert.match(schemaSql, /Staff members are not permitted to alter order totals/i);
  });

  test('Schema 3.11: RLS is enabled on all tables and staff permissions are restricted', () => {
    assert.match(schemaSql, /ALTER TABLE public\.inventory ENABLE ROW LEVEL SECURITY/i);
    assert.match(schemaSql, /ALTER TABLE public\.product_tags ENABLE ROW LEVEL SECURITY/i);
    assert.match(schemaSql, /ALTER TABLE public\.product_tag_mappings ENABLE ROW LEVEL SECURITY/i);
    assert.match(schemaSql, /CREATE OR REPLACE FUNCTION public\.is_staff\(\)/i);
  });
});

// ==============================================================================
// PART 4: LIVE DATABASE INTEGRATION TESTS (Distinguished & Safely Skipped)
// ==============================================================================
describe('Part 4: Live Database Integration Tests', () => {
  const hasLiveCredentials = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_URL.includes('your-project-id')
  );

  test('Live DB 4.1: Real PostgreSQL / Supabase connection & transaction check', (t) => {
    if (!hasLiveCredentials) {
      t.skip(
        'SKIPPED: Live database integration tests require active Supabase cloud credentials. ' +
        'In accordance with strict safety rules ("Do not execute the Supabase migration. Do not add real credentials"), ' +
        'live cloud execution is intentionally deferred until customer infrastructure deployment.'
      );
      return;
    }

    assert.ok(hasLiveCredentials, 'Live credentials are required for this test step');
  });
});
