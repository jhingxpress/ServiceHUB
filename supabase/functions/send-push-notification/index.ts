// @ts-nocheck
// Supabase Edge Function — send-push-notification
// Deploy: supabase functions deploy send-push-notification
// Deno runtime — no npm imports needed

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface PushToken {
  id: string;
  expo_push_token: string;
}

interface ExpoTicket {
  id?: string;
  status: 'ok' | 'error';
  details?: { error?: string };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { user_id, title, body, data = {} } = payload;

  if (!user_id || !title || !body) {
    return new Response(
      JSON.stringify({ error: 'user_id, title, and body are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 1. Fetch all push tokens for this user
  const { data: tokens, error: tokenErr } = await db
    .from('user_push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', user_id);

  if (tokenErr) {
    console.error('[push] Token fetch error:', tokenErr);
    return new Response(
      JSON.stringify({ error: tokenErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!tokens || tokens.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: 'no_tokens_registered' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const validTokens = (tokens as PushToken[]).filter(
    (t) => t.expo_push_token && t.expo_push_token.startsWith('ExponentPushToken[')
  );

  if (validTokens.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: 'no_valid_expo_tokens' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Build Expo messages
  const messages = validTokens.map((t) => ({
    to: t.expo_push_token,
    title,
    body,
    data,
    sound: 'default',
    channelId: (data.channelId as string) ?? 'general',
    priority: 'high',
  }));

  // 3. Send to Expo Push API (batch up to 100)
  const BATCH_SIZE = 100;
  const allTickets: ExpoTicket[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });
      const result = await res.json();
      if (Array.isArray(result.data)) {
        allTickets.push(...result.data);
      }
    } catch (err) {
      console.error('[push] Expo API error:', err);
    }
  }

  // 4. Handle DeviceNotRegistered errors — remove invalid tokens
  const invalidTokenIds: string[] = [];
  allTickets.forEach((ticket, i) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      if (validTokens[i]) {
        invalidTokenIds.push(validTokens[i].id);
      }
    }
  });

  if (invalidTokenIds.length > 0) {
    const { error: delErr } = await db
      .from('user_push_tokens')
      .delete()
      .in('id', invalidTokenIds);
    if (delErr) {
      console.error('[push] Failed to remove invalid tokens:', delErr);
    } else {
      console.log(`[push] Removed ${invalidTokenIds.length} invalid token(s)`);
    }
  }

  const sent = allTickets.filter((t) => t.status === 'ok').length;
  const failed = allTickets.length - sent;

  console.log(`[push] Sent: ${sent}, Failed: ${failed}, Invalid removed: ${invalidTokenIds.length}`);

  return new Response(
    JSON.stringify({
      sent,
      failed,
      invalid_removed: invalidTokenIds.length,
      total_tokens: validTokens.length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
