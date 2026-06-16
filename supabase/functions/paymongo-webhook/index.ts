// @ts-nocheck
// Supabase Edge Function — paymongo-webhook
// Deploy: supabase functions deploy paymongo-webhook
//
// Purpose:
//   Receives PayMongo TEST webhook events.
//   Routes by metadata.payment_type:
//     featured_payment (default) → updates featured_payments, notifies admins.
//     servicehub_tip             → updates servicehub_tips, notifies user.
//   Does NOT auto-grant featured status. Admin approval required.
//
// Required Supabase secrets:
//   PAYMONGO_WEBHOOK_SECRET   — webhook signing secret from PayMongo dashboard
//   PUSH_NOTIFICATION_SECRET  — shared secret for send-push-notification function
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//
// PayMongo signature format:
//   Header:  paymongo-signature
//   Value:   t=<unix_timestamp>,te=<test_sig>,li=<live_sig>
//   Message: <timestamp>.<raw_body>
//   Hash:    HMAC-SHA256(PAYMONGO_WEBHOOK_SECRET, message) → hex

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Environment ──────────────────────────────────────────
  const supabaseUrl  = Deno.env.get('SUPABASE_URL');
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET');
  const pushSecret    = Deno.env.get('PUSH_NOTIFICATION_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing Supabase environment variables' }, 500);
  }

  if (!webhookSecret) {
    console.error('[webhook] PAYMONGO_WEBHOOK_SECRET not configured');
    return json({ error: 'Webhook secret not configured' }, 500);
  }

  // ── Read raw body (needed for signature verification) ─────
  const rawBody = await req.text();

  // ── Verify PayMongo signature ─────────────────────────────
  const sigHeader = req.headers.get('paymongo-signature');

  if (!sigHeader) {
    console.error('[webhook] Missing paymongo-signature header');
    return json({ error: 'Missing signature' }, 401);
  }

  const sigParts = Object.fromEntries(
    sigHeader.split(',').map((part) => {
      const [k, v] = part.split('=');
      return [k, v];
    })
  );

  const timestamp = sigParts['t'];
  const testSig   = sigParts['te'];

  if (!timestamp || !testSig) {
    console.error('[webhook] Malformed paymongo-signature header:', sigHeader);
    return json({ error: 'Malformed signature header' }, 401);
  }

  // Replay-attack guard: reject events older than 1 hour.
  // PayMongo retries failed webhooks at ~5 min, ~10 min, ~30 min using the
  // ORIGINAL timestamp — 300 s was rejecting every retry delivery.
  const eventAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (eventAge > 3600) {
    console.error('[webhook] Event too old:', Math.round(eventAge), 'seconds — exceeds 3600 s limit');
    return json({ error: 'Event timestamp too old' }, 401);
  }

  const message  = `${timestamp}.${rawBody}`;
  const expected = await generateHmacSHA256(webhookSecret, message);

  if (expected !== testSig) {
    console.error('[webhook] Signature mismatch — verify PAYMONGO_WEBHOOK_SECRET is correct');
    return json({ error: 'Invalid signature' }, 401);
  }

  console.log('[webhook] Signature verified ✓');

  // ── Parse event ───────────────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const eventType = event?.data?.attributes?.type;
  console.log('[webhook] Event type:', eventType);

  // ── Only handle checkout_session.payment.paid ─────────────
  if (eventType !== 'checkout_session.payment.paid') {
    console.log('[webhook] Unhandled event type, ignoring:', eventType);
    return json({ received: true, handled: false });
  }

  // ── Extract checkout session data ─────────────────────────
  const checkoutSession = event?.data?.attributes?.data;
  const checkoutId      = checkoutSession?.id;
  const metadata        = checkoutSession?.attributes?.metadata ?? {};
  const payments        = checkoutSession?.attributes?.payments ?? [];

  if (!checkoutId) {
    console.error('[webhook] No checkout session id in event');
    return json({ error: 'Missing checkout session id' }, 400);
  }

  console.log('[webhook] Checkout session id:', checkoutId);
  console.log('[webhook] Metadata:', JSON.stringify(metadata));

  // ── Database client (service role) ───────────────────────
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── Route by payment_type ────────────────────────────────
  const paymentType = metadata?.payment_type ?? 'featured_payment';
  console.log('[webhook] payment_type:', paymentType);

  if (paymentType === 'servicehub_tip') {
    return await processTipPayment(db, checkoutId, metadata, payments, pushSecret, supabaseUrl);
  }

  // ── Default path: find matching featured_payment ─────────
  const { data: payment, error: findErr } = await db
    .from('featured_payments')
    .select('id, provider_id, featured_request_id, amount, status')
    .eq('paymongo_checkout_id', checkoutId)
    .maybeSingle();

  if (findErr) {
    console.error('[webhook] DB lookup error:', findErr);
    return json({ error: 'DB lookup failed' }, 500);
  }

  if (!payment) {
    // Also try lookup by metadata.payment_id for robustness
    const metaPaymentId = metadata?.payment_id;
    if (metaPaymentId) {
      const { data: fallback } = await db
        .from('featured_payments')
        .select('id, provider_id, featured_request_id, amount, status')
        .eq('id', metaPaymentId)
        .maybeSingle();

      if (!fallback) {
        console.error('[webhook] No featured_payment found for checkout:', checkoutId, 'metadata_id:', metaPaymentId);
        return json({ error: 'Payment record not found' }, 404);
      }

      // Found via metadata fallback — proceed with fallback record
      return await processPayment(db, fallback, checkoutId, payments, pushSecret, supabaseUrl);
    }

    console.error('[webhook] No featured_payment found for checkout:', checkoutId);
    return json({ error: 'Payment record not found' }, 404);
  }

  // ── Idempotency: already processed ───────────────────────
  if (payment.status === 'paid') {
    console.log('[webhook] Payment already processed, ignoring duplicate event');
    return json({ received: true, handled: false, reason: 'already_paid' });
  }

  return await processPayment(db, payment, checkoutId, payments, pushSecret, supabaseUrl);
});

async function processPayment(
  db: any,
  payment: any,
  checkoutId: string,
  payments: any[],
  pushSecret: string,
  supabaseUrl: string
): Promise<Response> {
  const paymentId   = payment.id;
  const providerId  = payment.provider_id;
  const featReqId   = payment.featured_request_id;

  // ── Validate amount ────────────────────────────────────────
  const expectedAmountCentavos = 9900;
  const paidAmountCentavos = payments[0]?.attributes?.amount ?? 0;

  if (paidAmountCentavos < expectedAmountCentavos) {
    console.error(`[webhook] Amount mismatch: paid ${paidAmountCentavos}, expected ${expectedAmountCentavos}`);
    await db.from('featured_payments').update({ status: 'failed' }).eq('id', paymentId);
    return json({ error: 'Payment amount mismatch' }, 400);
  }

  // ── Extract PayMongo payment id ────────────────────────────
  const pmPaymentId = payments[0]?.id ?? null;
  const paidAt      = new Date().toISOString();

  console.log(`[webhook] Updating payment ${paymentId} → paid`);
  console.log(`[webhook] PayMongo payment id: ${pmPaymentId}`);

  // ── Update featured_payments ───────────────────────────────
  const { error: updateErr } = await db
    .from('featured_payments')
    .update({
      status:               'paid',
      paymongo_payment_id:  pmPaymentId,
      paid_at:              paidAt,
    })
    .eq('id', paymentId);

  if (updateErr) {
    console.error('[webhook] featured_payments update error:', updateErr);
    return json({ error: 'Failed to update payment record' }, 500);
  }

  // ── Log to provider_verification_logs ─────────────────────
  await db.from('provider_verification_logs').insert({
    provider_id:  providerId,
    action:       'featured_payment_received',
    performed_by: null,
    notes:        `PayMongo test payment confirmed. Checkout: ${checkoutId}. Amount: ₱${(paidAmountCentavos / 100).toFixed(2)}. Awaiting admin approval.`,
  });

  // ── Notify admins via push notification ────────────────────
  try {
    // Fetch all admin user IDs
    const { data: adminUsers } = await db
      .from('users')
      .select('id')
      .eq('role', 'admin');

    if (adminUsers && adminUsers.length > 0) {
      const { data: providerData } = await db
        .from('providers')
        .select('business_name')
        .eq('id', providerId)
        .single();

      const businessName = providerData?.business_name ?? 'A provider';

      for (const admin of adminUsers) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'x-push-secret': pushSecret,
            },
            body: JSON.stringify({
              user_id: admin.id,
              title:   '💳 Featured Payment Received',
              body:    `${businessName} has paid for Featured Provider. Review and approve.`,
              data: {
                type:       'featured_payment',
                providerId: providerId,
                paymentId:  paymentId,
                channelId:  'admin',
              },
            }),
          });
          console.log(`[webhook] Push notification sent to admin ${admin.id}`);
        } catch (pushErr) {
          console.error(`[webhook] Push notification failed for admin ${admin.id}:`, pushErr);
        }
      }
    }
  } catch (notifyErr) {
    console.error('[webhook] Admin notification error (non-fatal):', notifyErr);
  }

  console.log(`[webhook] Payment ${paymentId} processed successfully`);

  return json({
    received:   true,
    handled:    true,
    payment_id: paymentId,
    status:     'paid',
  });
}

// ── Tip payment processor ─────────────────────────────────────────────────────
async function processTipPayment(
  db: any,
  checkoutId: string,
  metadata: any,
  payments: any[],
  pushSecret: string,
  supabaseUrl: string
): Promise<Response> {
  const tipId  = metadata?.tip_id;
  const userId = metadata?.user_id;
  const expectedCentavos = Number(metadata?.amount ?? 0);

  if (!tipId) {
    console.error('[webhook/tip] No tip_id in metadata');
    return json({ error: 'Missing tip_id in metadata' }, 400);
  }

  // ── Lookup tip record ───────────────────────────────────
  const { data: tip, error: findErr } = await db
    .from('servicehub_tips')
    .select('id, user_id, amount, status')
    .eq('paymongo_checkout_id', checkoutId)
    .maybeSingle();

  const record = tip ?? (tipId ? await db
    .from('servicehub_tips')
    .select('id, user_id, amount, status')
    .eq('id', tipId)
    .maybeSingle()
    .then((r: any) => r.data) : null);

  if (!record) {
    console.error('[webhook/tip] No tip record found for checkout:', checkoutId, 'tip_id:', tipId);
    return json({ error: 'Tip record not found' }, 404);
  }

  if (record.status === 'paid') {
    console.log('[webhook/tip] Tip already processed, ignoring duplicate');
    return json({ received: true, handled: false, reason: 'already_paid' });
  }

  // ── Validate amount (server-side) ───────────────────────
  const paidCentavos = payments[0]?.attributes?.amount ?? 0;
  const MIN_TIP = 2000;  // ₱20
  const MAX_TIP = 1000000; // ₱10,000

  if (paidCentavos < MIN_TIP || paidCentavos > MAX_TIP) {
    console.error(`[webhook/tip] Invalid tip amount: ${paidCentavos} centavos`);
    await db.from('servicehub_tips').update({ status: 'failed' }).eq('id', record.id);
    return json({ error: 'Tip amount out of valid range' }, 400);
  }

  const pmPaymentId = payments[0]?.id ?? null;
  const paidAt      = new Date().toISOString();

  // ── Update tip record ───────────────────────────────────
  const { error: updateErr } = await db
    .from('servicehub_tips')
    .update({
      status:               'paid',
      paymongo_payment_id:  pmPaymentId,
      paid_at:              paidAt,
      amount:               paidCentavos, // store actual paid amount
    })
    .eq('id', record.id);

  if (updateErr) {
    console.error('[webhook/tip] Update error:', updateErr);
    return json({ error: 'Failed to update tip record' }, 500);
  }

  console.log(`[webhook/tip] Tip ${record.id} marked paid — ₱${(paidCentavos / 100).toFixed(2)}`);

  // ── Thank-you push notification to user (non-fatal) ────
  const notifyUserId = record.user_id ?? userId;
  if (notifyUserId && pushSecret) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-push-secret': pushSecret },
        body: JSON.stringify({
          user_id: notifyUserId,
          title:   '❤️ Thank You for Supporting ServiceHub',
          body:    'Your contribution has been received. Thank you for helping us improve the platform!',
          data:    { type: 'servicehub_tip', channelId: 'general' },
        }),
      });
    } catch (err) {
      console.warn('[webhook/tip] Push notification failed (non-fatal):', err);
    }
  }

  return json({ received: true, handled: true, tip_id: record.id, status: 'paid' });
}

async function generateHmacSHA256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
