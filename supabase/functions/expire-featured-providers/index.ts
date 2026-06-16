// @ts-nocheck
// Supabase Edge Function — expire-featured-providers
// Deploy: supabase functions deploy expire-featured-providers
//
// Purpose:
//   Runs daily via pg_cron (or manually via POST).
//   1. Downgrades providers whose featured_until has passed.
//   2. Sends "Expired" push notification to downgraded providers.
//   3. Sends "Expiring Soon" push notification (≤7 days remaining).
//
// Required Supabase secrets:
//   PUSH_NOTIFICATION_SECRET  — shared secret for send-push-notification
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const pushSecret  = Deno.env.get('PUSH_NOTIFICATION_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing environment variables' }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const now              = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── Step 1: Expire overdue featured providers ─────────────────────────────
  const { data: expired, error: expireErr } = await db
    .from('providers')
    .update({ is_featured: false, featured_until: null })
    .eq('is_featured', true)
    .lt('featured_until', now.toISOString())
    .select('id, business_name');

  if (expireErr) {
    console.error('[expire-featured] Error expiring providers:', expireErr);
    return json({ error: 'Failed to expire providers' }, 500);
  }

  const expiredCount = expired?.length ?? 0;
  console.log(`[expire-featured] Expired ${expiredCount} provider(s)`);

  // ── Step 2: Log + notify expired providers ────────────────────────────────
  for (const p of (expired ?? [])) {
    await db.from('provider_verification_logs').insert({
      provider_id:  p.id,
      action:       'featured_expired_auto',
      performed_by: null,
      notes:        'Featured status automatically expired by scheduled job.',
    });
    await sendPush(supabaseUrl, pushSecret, {
      user_id: p.id,
      title:   '❌ Featured Provider Status Expired',
      body:    'Your Featured Provider status has expired. Renew now to regain featured visibility.',
      data:    { type: 'featured_expired', channelId: 'provider' },
    });
  }

  // ── Step 3: Find providers expiring within 7 days ────────────────────────
  const { data: expiringSoon, error: soonErr } = await db
    .from('providers')
    .select('id, business_name, featured_until')
    .eq('is_featured', true)
    .not('featured_until', 'is', null)
    .gt('featured_until', now.toISOString())
    .lte('featured_until', sevenDaysFromNow.toISOString());

  if (soonErr) {
    console.error('[expire-featured] Error querying expiring-soon providers:', soonErr);
  }

  const soonCount = expiringSoon?.length ?? 0;
  console.log(`[expire-featured] Sending expiry warning to ${soonCount} provider(s)`);

  // ── Step 4: Notify expiring-soon providers ────────────────────────────────
  for (const p of (expiringSoon ?? [])) {
    const daysLeft = Math.ceil(
      (new Date(p.featured_until).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    await sendPush(supabaseUrl, pushSecret, {
      user_id: p.id,
      title:   `⚠️ Featured Status Expires in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`,
      body:    'Renew now to keep your featured placement and maintain search visibility.',
      data:    { type: 'featured_expiring_soon', daysLeft, channelId: 'provider' },
    });
  }

  return json({ expired: expiredCount, expiringSoon: soonCount });
});

async function sendPush(
  supabaseUrl: string,
  pushSecret: string,
  payload: { user_id: string; title: string; body: string; data: Record<string, unknown> }
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-push-secret': pushSecret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[expire-featured] Push failed for ${payload.user_id}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[expire-featured] Push error for ${payload.user_id}:`, err);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
