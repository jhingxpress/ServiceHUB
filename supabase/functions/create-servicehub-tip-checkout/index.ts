// @ts-nocheck
// Supabase Edge Function — create-servicehub-tip-checkout
// Deploy: supabase functions deploy create-servicehub-tip-checkout
//
// Purpose:
//   Creates a PayMongo TEST checkout session for an optional ServiceHub tip.
//   Validates JWT, validates amount (₱20–₱10,000), creates pending tip record,
//   and returns a PayMongo checkout URL.
//
// Required Supabase secrets:
//   PAYMONGO_SECRET_KEY       — PayMongo test secret key (sk_test_...)
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//   SUPABASE_ANON_KEY         — set automatically

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_AMOUNT_PESOS  = 20;
const MAX_AMOUNT_PESOS  = 10_000;
const MIN_CENTAVOS      = MIN_AMOUNT_PESOS * 100;
const MAX_CENTAVOS      = MAX_AMOUNT_PESOS * 100;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Environment ──────────────────────────────────────────
  const supabaseUrl  = Deno.env.get('SUPABASE_URL');
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const paymongoKey  = Deno.env.get('PAYMONGO_SECRET_KEY');

  if (!supabaseUrl || !serviceKey || !paymongoKey) {
    return json({ error: 'Missing environment variables' }, 500);
  }

  // ── Authenticate caller ───────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '');

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  // ── Parse + validate body ─────────────────────────────────
  let body: { amount_pesos?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const amountPesos = Number(body?.amount_pesos);
  if (!Number.isFinite(amountPesos) || amountPesos < MIN_AMOUNT_PESOS || amountPesos > MAX_AMOUNT_PESOS) {
    return json({ error: `Amount must be between ₱${MIN_AMOUNT_PESOS} and ₱${MAX_AMOUNT_PESOS}` }, 400);
  }
  const amountCentavos = Math.round(amountPesos * 100);
  if (amountCentavos < MIN_CENTAVOS || amountCentavos > MAX_CENTAVOS) {
    return json({ error: 'Amount out of valid range' }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Create pending tip record ─────────────────────────────
  const { data: tip, error: tipErr } = await db
    .from('servicehub_tips')
    .insert({
      user_id:  userId,
      amount:   amountCentavos,
      currency: 'PHP',
      status:   'pending',
    })
    .select('id')
    .single();

  if (tipErr || !tip) {
    console.error('[tip-checkout] Failed to create tip record:', tipErr);
    return json({ error: 'Failed to create tip record' }, 500);
  }

  const tipId = tip.id;

  // ── Create PayMongo checkout session ─────────────────────
  const checkoutBody = {
    data: {
      attributes: {
        line_items: [
          {
            currency: 'PHP',
            amount:   amountCentavos,
            name:     `Support ServiceHub — Optional Tip (₱${amountPesos})`,
            quantity: 1,
          },
        ],
        payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
        success_url: 'com.servicehub.app://tip/success',
        cancel_url:  'com.servicehub.app://tip/cancel',
        description: 'Optional support tip for ServiceHub platform',
        metadata: {
          tip_id:       tipId,
          user_id:      userId,
          amount:       amountCentavos,
          payment_type: 'servicehub_tip',
        },
        send_email_receipt: false,
        show_description:   true,
        show_line_items:    true,
      },
    },
  };

  let pmResponse: any;
  try {
    const res = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${btoa(paymongoKey + ':')}`,
      },
      body: JSON.stringify(checkoutBody),
    });
    pmResponse = await res.json();
    if (!res.ok) {
      console.error('[tip-checkout] PayMongo error:', JSON.stringify(pmResponse));
      await db.from('servicehub_tips').update({ status: 'failed' }).eq('id', tipId);
      return json({ error: 'PayMongo checkout creation failed', detail: pmResponse?.errors }, 502);
    }
  } catch (fetchErr) {
    console.error('[tip-checkout] PayMongo fetch error:', fetchErr);
    await db.from('servicehub_tips').update({ status: 'failed' }).eq('id', tipId);
    return json({ error: 'Failed to reach PayMongo' }, 502);
  }

  const checkoutId  = pmResponse?.data?.id;
  const checkoutUrl = pmResponse?.data?.attributes?.checkout_url;

  if (!checkoutId || !checkoutUrl) {
    console.error('[tip-checkout] Missing checkout fields:', JSON.stringify(pmResponse));
    await db.from('servicehub_tips').update({ status: 'failed' }).eq('id', tipId);
    return json({ error: 'Invalid PayMongo response' }, 502);
  }

  // ── Persist checkout ID + URL on tip record ───────────────
  await db
    .from('servicehub_tips')
    .update({ paymongo_checkout_id: checkoutId, checkout_url: checkoutUrl })
    .eq('id', tipId);

  console.log(`[tip-checkout] Tip ${tipId} — checkout created: ${checkoutId}`);

  return json({ tip_id: tipId, checkout_url: checkoutUrl });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
