// @ts-nocheck
// Supabase Edge Function — create-platform-fee-checkout
// Deploy: supabase functions deploy create-platform-fee-checkout
//
// Purpose:
//   Creates a PayMongo TEST checkout session for provider platform fee payment.
//   Accepts a list of platform fee IDs from the provider app.
//   Verifies ownership and unpaid status SERVER-SIDE before computing total.
//   Inserts a platform_fee_payments session row and returns checkout_url.
//
// Required Supabase secrets:
//   PAYMONGO_SECRET_KEY       — PayMongo test secret key (sk_test_...)
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//   SUPABASE_ANON_KEY         — set automatically
//
// Deep link return URLs:
//   success: com.servicehub.app://platform-fees/success
//   cancel:  com.servicehub.app://platform-fees/cancel

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYMONGO_API  = 'https://api.paymongo.com/v1';
const MIN_CENTAVOS  = 2000; // PayMongo minimum ₱20
const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Environment ──────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const paymongoKey = Deno.env.get('PAYMONGO_SECRET_KEY');

  if (!supabaseUrl || !serviceKey || !paymongoKey) {
    return json({ error: 'Missing environment variables' }, 500);
  }
  if (!paymongoKey.startsWith('sk_test_')) {
    console.error('[pfee-checkout] SECURITY: Non-test key detected. Refusing.');
    return json({ error: 'Only TEST mode keys are permitted' }, 500);
  }

  // ── Authenticate caller via JWT ───────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const jwt = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const providerId = user.id;
  console.log(`[pfee-checkout] Provider ${providerId} requesting fee checkout`);

  // ── Parse + validate body ─────────────────────────────────
  let body: { fee_ids?: string[] };
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const feeIds = body?.fee_ids;
  if (!Array.isArray(feeIds) || feeIds.length === 0) {
    return json({ error: 'fee_ids must be a non-empty array' }, 400);
  }
  if (feeIds.length > 100) {
    return json({ error: 'Maximum 100 fee IDs per request' }, 400);
  }
  if (feeIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return json({ error: 'Invalid fee_id format' }, 400);
  }

  // ── Service-role DB client ────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Verify provider exists and is approved ────────────────
  const { data: provider, error: provErr } = await db
    .from('providers')
    .select('id, business_name, status')
    .eq('id', providerId)
    .single();

  if (provErr || !provider) return json({ error: 'Provider not found' }, 404);
  if (provider.status !== 'approved') {
    return json({ error: 'Provider must be approved to make payments' }, 403);
  }

  // ── Verify ownership + unpaid status of all requested fees ─
  const { data: fees, error: feesErr } = await db
    .from('provider_platform_fees')
    .select('id, provider_id, platform_fee, status')
    .in('id', feeIds);

  if (feesErr) {
    console.error('[pfee-checkout] Fee lookup error:', feesErr);
    return json({ error: 'Failed to verify fees' }, 500);
  }

  // All requested IDs must exist
  if (!fees || fees.length !== feeIds.length) {
    return json({ error: 'One or more fee IDs not found' }, 404);
  }

  // Every fee must belong to the calling provider — NEVER trust the client
  const unauthorized = fees.find((f: any) => f.provider_id !== providerId);
  if (unauthorized) {
    console.error(`[pfee-checkout] Ownership violation: fee ${unauthorized.id} belongs to ${unauthorized.provider_id}, caller is ${providerId}`);
    return json({ error: 'Unauthorized: fee does not belong to this provider' }, 403);
  }

  // Every fee must be unpaid
  const nonUnpaid = fees.find((f: any) => f.status !== 'unpaid');
  if (nonUnpaid) {
    return json({
      error: `Fee is not payable (id: ${nonUnpaid.id}, status: ${nonUnpaid.status})`,
    }, 409);
  }

  // ── Compute total SERVER-SIDE (never trust client) ────────
  const totalPesos    = (fees as any[]).reduce((s: number, f: any) => s + Number(f.platform_fee), 0);
  const totalCentavos = Math.round(totalPesos * 100);

  if (totalCentavos < MIN_CENTAVOS) {
    return json({
      error: `Minimum payment is ₱20.00. Your total is ₱${totalPesos.toFixed(2)}. Accumulate more fees before paying.`,
    }, 400);
  }

  console.log(`[pfee-checkout] Verified ${fees.length} fees — total ₱${totalPesos.toFixed(2)}`);

  // ── Idempotency: return any pending checkout for this provider ─
  const { data: existingSession } = await db
    .from('platform_fee_payments')
    .select('id, checkout_url, paymongo_checkout_id')
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .not('checkout_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSession?.checkout_url) {
    console.log(`[pfee-checkout] Returning existing pending session ${existingSession.id}`);
    return json({
      checkout_url: existingSession.checkout_url,
      payment_id:   existingSession.id,
      reused:       true,
    });
  }

  // ── Insert platform_fee_payments placeholder ──────────────
  const { data: session, error: sessionErr } = await db
    .from('platform_fee_payments')
    .insert({
      provider_id:      providerId,
      platform_fee_ids: feeIds,
      total_amount:     totalPesos,
      status:           'pending',
    })
    .select('id')
    .single();

  if (sessionErr || !session) {
    console.error('[pfee-checkout] Failed to create payment session:', sessionErr);
    return json({ error: 'Failed to create payment session' }, 500);
  }

  const sessionId = session.id;
  const feeCount  = feeIds.length;
  console.log(`[pfee-checkout] Session ${sessionId} — ${feeCount} fee(s) — ₱${totalPesos.toFixed(2)}`);

  // ── Create PayMongo Checkout Session ─────────────────────
  const paymongoAuth = btoa(`${paymongoKey}:`);
  const description  = `TAGA Platform Fee — ${provider.business_name ?? providerId.slice(0, 8)}`;

  let checkoutData: any;
  try {
    const pmRes = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept:         'application/json',
        Authorization:  `Basic ${paymongoAuth}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount:   totalCentavos,
            currency: 'PHP',
            description,
            line_items: [
              {
                name:     `TAGA Platform Fee (${feeCount} booking${feeCount !== 1 ? 's' : ''})`,
                amount:   totalCentavos,
                currency: 'PHP',
                quantity: 1,
              },
            ],
            payment_method_types: ['card', 'gcash'],
            success_url:  'com.servicehub.app://platform-fees/success',
            cancel_url:   'com.servicehub.app://platform-fees/cancel',
            statement_descriptor: 'TAGA Platform Fee',
            send_email_receipt:   false,
            show_description:     true,
            show_line_items:      true,
            metadata: {
              payment_type: 'platform_fee_payment',
              session_id:   sessionId,
              provider_id:  providerId,
              fee_count:    feeCount,
              environment:  'test',
            },
          },
        },
      }),
    });

    if (!pmRes.ok) {
      const errBody = await pmRes.text();
      console.error('[pfee-checkout] PayMongo API error:', pmRes.status, errBody);
      await db.from('platform_fee_payments').update({ status: 'failed' }).eq('id', sessionId);
      return json({ error: `PayMongo API error: ${pmRes.status}` }, 502);
    }

    const pmJson = await pmRes.json();
    checkoutData  = pmJson.data;
  } catch (err) {
    console.error('[pfee-checkout] PayMongo fetch error:', err);
    await db.from('platform_fee_payments').update({ status: 'failed' }).eq('id', sessionId);
    return json({ error: 'Failed to reach PayMongo API' }, 502);
  }

  const checkoutId  = checkoutData?.id;
  const checkoutUrl = checkoutData?.attributes?.checkout_url;

  if (!checkoutId || !checkoutUrl) {
    console.error('[pfee-checkout] Missing checkout fields:', JSON.stringify(checkoutData));
    await db.from('platform_fee_payments').update({ status: 'failed' }).eq('id', sessionId);
    return json({ error: 'PayMongo did not return a checkout URL' }, 502);
  }

  // ── Persist checkout details on session ───────────────────
  const { error: persistErr } = await db
    .from('platform_fee_payments')
    .update({ paymongo_checkout_id: checkoutId, checkout_url: checkoutUrl })
    .eq('id', sessionId);

  if (persistErr) {
    console.warn(
      `[pfee-checkout] Failed to persist paymongo_checkout_id on session ${sessionId} (non-fatal — webhook will fall back to session_id):`,
      persistErr.message
    );
  }

  console.log(`[pfee-checkout] Checkout ${checkoutId} ready for session ${sessionId}`);

  return json({
    checkout_url: checkoutUrl,
    payment_id:   sessionId,
    reused:       false,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
