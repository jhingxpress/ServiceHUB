// @ts-nocheck
// Supabase Edge Function — create-featured-checkout
// Deploy: supabase functions deploy create-featured-checkout
//
// Purpose:
//   Creates a PayMongo TEST checkout session for Featured Provider payment.
//   Inserts featured_requests + featured_payments rows atomically.
//   Returns checkout_url for the provider app to open in a browser.
//
// Required Supabase secrets:
//   PAYMONGO_SECRET_KEY     — PayMongo TEST secret key (sk_test_xxx)
//   SUPABASE_URL            — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//
// IMPORTANT: TEST MODE ONLY. Never use a live key here.
// Featured status is NOT granted automatically — admin approval required.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAYMONGO_API = 'https://api.paymongo.com/v1';
const FEATURED_AMOUNT_CENTAVOS = 9900; // ₱99.00

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
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const paymongoKey = Deno.env.get('PAYMONGO_SECRET_KEY');

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing Supabase environment variables' }, 500);
  }
  if (!paymongoKey) {
    return json({ error: 'PAYMONGO_SECRET_KEY not configured in Supabase secrets' }, 500);
  }
  if (!paymongoKey.startsWith('sk_test_')) {
    console.error('[checkout] SECURITY: Non-test key detected. Refusing to proceed.');
    return json({ error: 'Only TEST mode keys are permitted' }, 500);
  }

  // ── Authenticate caller via JWT ───────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '');

  // Use anon key to validate JWT and get user
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const providerId = user.id;
  console.log(`[checkout] Provider ${providerId} requesting featured checkout`);

  // ── Service-role DB client ────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── Verify provider is approved ──────────────────────────
  const { data: provider, error: provErr } = await db
    .from('providers')
    .select('id, business_name, status, is_featured')
    .eq('id', providerId)
    .single();

  if (provErr || !provider) {
    return json({ error: 'Provider not found' }, 404);
  }
  if (provider.status !== 'approved') {
    return json({ error: 'Provider must be approved to request featured status' }, 403);
  }
  if (provider.is_featured) {
    return json({ error: 'Provider is already featured' }, 409);
  }

  // ── Idempotency: return existing pending checkout ─────────
  const { data: existingPayment } = await db
    .from('featured_payments')
    .select('id, status, checkout_url, paymongo_checkout_id')
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPayment?.checkout_url) {
    console.log(`[checkout] Returning existing pending checkout ${existingPayment.id}`);
    return json({
      checkout_url: existingPayment.checkout_url,
      checkout_id: existingPayment.paymongo_checkout_id,
      payment_id: existingPayment.id,
      reused: true,
    });
  }

  // ── Insert featured_requests row ──────────────────────────
  // Uses ON CONFLICT DO NOTHING because the unique index prevents duplicates.
  const { data: featReq, error: reqErr } = await db
    .from('featured_requests')
    .insert({ provider_id: providerId, status: 'pending' })
    .select('id')
    .single();

  let featuredRequestId: string | null = null;
  if (reqErr) {
    // Conflict: a pending request already exists — find it
    if (reqErr.code === '23505') {
      const { data: existing } = await db
        .from('featured_requests')
        .select('id')
        .eq('provider_id', providerId)
        .eq('status', 'pending')
        .single();
      featuredRequestId = existing?.id ?? null;
    } else {
      console.error('[checkout] featured_requests insert error:', reqErr);
      return json({ error: 'Failed to create featured request' }, 500);
    }
  } else {
    featuredRequestId = featReq.id;
  }

  // ── Insert featured_payments placeholder ──────────────────
  const { data: payment, error: payErr } = await db
    .from('featured_payments')
    .insert({
      provider_id: providerId,
      featured_request_id: featuredRequestId,
      amount: FEATURED_AMOUNT_CENTAVOS / 100, // store as ₱99
      currency: 'PHP',
      status: 'pending',
    })
    .select('id')
    .single();

  if (payErr || !payment) {
    console.error('[checkout] featured_payments insert error:', payErr);
    return json({ error: 'Failed to create payment record' }, 500);
  }

  const paymentId = payment.id;
  console.log(`[checkout] Created payment record ${paymentId}`);

  // ── Create PayMongo checkout session ─────────────────────
  const paymongoAuth = btoa(`${paymongoKey}:`);

  let checkoutData: any;
  try {
    const pmRes = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${paymongoAuth}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: FEATURED_AMOUNT_CENTAVOS,
            currency: 'PHP',
            description: `ServiceHub Featured Provider — ${provider.business_name ?? providerId}`,
            line_items: [
              {
                name: 'Featured Provider Promotion — 30 days',
                amount: FEATURED_AMOUNT_CENTAVOS,
                currency: 'PHP',
                quantity: 1,
              },
            ],
            payment_method_types: ['card', 'gcash'],
            success_url: 'https://servicehub.app/featured/success',
            cancel_url:  'https://servicehub.app/featured/cancel',
            statement_descriptor: 'ServiceHub Featured',
            metadata: {
              payment_id:   paymentId,
              provider_id:  providerId,
              environment:  'test',
            },
          },
        },
      }),
    });

    if (!pmRes.ok) {
      const errBody = await pmRes.text();
      console.error('[checkout] PayMongo API error:', pmRes.status, errBody);
      // Clean up the placeholder payment on failure
      await db.from('featured_payments').update({ status: 'failed' }).eq('id', paymentId);
      return json({ error: `PayMongo API error: ${pmRes.status}` }, 502);
    }

    const pmJson = await pmRes.json();
    checkoutData = pmJson.data;
  } catch (err) {
    console.error('[checkout] PayMongo fetch error:', err);
    await db.from('featured_payments').update({ status: 'failed' }).eq('id', paymentId);
    return json({ error: 'Failed to reach PayMongo API' }, 502);
  }

  const checkoutId  = checkoutData.id;
  const checkoutUrl = checkoutData.attributes?.checkout_url ?? checkoutData.attributes?.redirect?.checkout_url;

  if (!checkoutUrl) {
    console.error('[checkout] No checkout_url in PayMongo response:', JSON.stringify(checkoutData));
    await db.from('featured_payments').update({ status: 'failed' }).eq('id', paymentId);
    return json({ error: 'PayMongo did not return a checkout URL' }, 502);
  }

  // ── Update payment record with checkout details ───────────
  await db
    .from('featured_payments')
    .update({
      paymongo_checkout_id: checkoutId,
      checkout_url: checkoutUrl,
    })
    .eq('id', paymentId);

  console.log(`[checkout] Checkout session ${checkoutId} created for payment ${paymentId}`);

  return json({
    checkout_url: checkoutUrl,
    checkout_id:  checkoutId,
    payment_id:   paymentId,
    reused:       false,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
