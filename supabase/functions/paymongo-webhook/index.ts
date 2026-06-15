// @ts-nocheck
// Supabase Edge Function — paymongo-webhook
// Deploy: supabase functions deploy paymongo-webhook
//
// Purpose:
//   Receives PayMongo TEST webhook events and updates featured_payments.
//   Creates an admin push notification on confirmed payment.
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
import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts';

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

  // Replay-attack guard: reject events older than 5 minutes
  const eventAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (eventAge > 300) {
    console.error('[webhook] Event too old:', eventAge, 'seconds');
    return json({ error: 'Event timestamp too old' }, 401);
  }

  const message  = `${timestamp}.${rawBody}`;
  const expected = hmac('sha256', webhookSecret, message, 'utf8', 'hex') as string;

  if (expected !== testSig) {
    console.error('[webhook] Signature mismatch');
    console.error('[webhook] Expected:', expected);
    console.error('[webhook] Received:', testSig);
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

  // ── Find matching featured_payment ────────────────────────
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
