// @ts-nocheck
// Supabase Edge Function — notify-featured-approved
// Deploy: supabase functions deploy notify-featured-approved
//
// Purpose:
//   Called by admin UI after approving featured status.
//   Validates admin JWT, then sends approval push notification to the provider.
//
// Required Supabase secrets:
//   PUSH_NOTIFICATION_SECRET  — shared secret for send-push-notification
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//   SUPABASE_ANON_KEY         — set automatically

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const pushSecret  = Deno.env.get('PUSH_NOTIFICATION_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing environment variables' }, 500);
  }

  // ── Validate admin JWT ────────────────────────────────────
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
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: adminCheck } = await db
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (adminCheck?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  // ── Parse body ────────────────────────────────────────────
  const { provider_id, featured_until } = await req.json();
  if (!provider_id) return json({ error: 'provider_id required' }, 400);

  const untilLabel = featured_until
    ? new Date(featured_until).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '30 days';

  // ── Send push to provider ─────────────────────────────────
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-push-secret': pushSecret,
      },
      body: JSON.stringify({
        user_id: provider_id,
        title:   '🎉 Featured Provider Approved!',
        body:    `Your profile is now featured until ${untilLabel}. You'll appear at the top of search results.`,
        data:    { type: 'featured_approved', channelId: 'provider' },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[notify-featured-approved] Push failed:', res.status, errText);
      return json({ sent: false, error: `Push service returned ${res.status}` }, 502);
    }
  } catch (err) {
    console.error('[notify-featured-approved] Push error:', err);
    return json({ sent: false }, 500);
  }

  console.log(`[notify-featured-approved] Approval notification sent to provider ${provider_id}`);
  return json({ sent: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
