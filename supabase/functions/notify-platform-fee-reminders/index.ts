// @ts-nocheck
// Supabase Edge Function — notify-platform-fee-reminders
// Deploy: supabase functions deploy notify-platform-fee-reminders
//
// Purpose:
//   Runs daily via Supabase scheduled invocation (or manually via POST).
//   This is the SOLE scheduler for platform fee reminders/overdue alerts.
//
//   1. Calls process_platform_fee_reminders() which:
//      - inserts in-app notifications,
//      - atomically stamps reminder_sent_at / overdue_notified_at,
//      - returns the provider/title/body of the rows it just processed.
//   2. Sends push notifications to each returned provider.
//
// The returned rows are captured AFTER the stamp, so the push layer always
// has the exact set of providers that just received an in-app notification.
//
// Required Supabase secrets:
//   PUSH_NOTIFICATION_SECRET  — shared secret for send-push-notification
//   SUPABASE_URL              — set automatically
//   SUPABASE_SERVICE_ROLE_KEY — set automatically
//
// Schedule via Supabase Dashboard:
//   Edge Functions → notify-platform-fee-reminders → Schedule
//   Cron: "0 1 * * *"  (01:00 UTC daily)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ProviderNotifEntry {
  provider_id: string;
  title: string;
  body: string;
}

interface ReminderResult {
  reminder_count: number;
  overdue_count: number;
  reminded_providers: ProviderNotifEntry[];
  overdue_providers: ProviderNotifEntry[];
}

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const pushSecret  = Deno.env.get('PUSH_NOTIFICATION_SECRET') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing environment variables' }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Step 1: Run in-app notifications + stamp idempotency columns ─────────────
  const { data: result, error: rpcError } = await db.rpc('process_platform_fee_reminders');

  if (rpcError) {
    console.error('[notify-pfee-reminders] RPC error:', rpcError.message);
    return json({ error: rpcError.message }, 500);
  }

  const {
    reminder_count,
    overdue_count,
    reminded_providers,
    overdue_providers,
  } = result as ReminderResult;

  console.log(
    `[notify-pfee-reminders] In-app: ${reminder_count} reminder(s), ${overdue_count} overdue`
  );

  if (reminder_count === 0 && overdue_count === 0) {
    return json({ reminder_count: 0, overdue_count: 0, push_sent: 0 });
  }

  // ── Step 2: Push notifications ───────────────────────────────────────────────
  //
  // The SQL function already guarded against duplicates (reminder_sent_at /
  // overdue_notified_at are stamped before we reach here). Push is best-effort:
  // failures are logged but do not affect the function's return status.
  // ── ────────────────────────────────────────────────────────────────────────
  let pushSent = 0;

  for (const p of (reminded_providers ?? [])) {
    const ok = await sendPush(supabaseUrl, pushSecret, {
      user_id: p.provider_id,
      title:   p.title,
      body:    p.body,
      data:    { type: 'platform_fee_reminder', channelId: 'provider' },
    });
    if (ok) pushSent++;
  }

  for (const p of (overdue_providers ?? [])) {
    const ok = await sendPush(supabaseUrl, pushSecret, {
      user_id: p.provider_id,
      title:   p.title,
      body:    p.body,
      data:    { type: 'platform_fee_overdue', channelId: 'provider' },
    });
    if (ok) pushSent++;
  }

  console.log(`[notify-pfee-reminders] Push sent: ${pushSent}`);

  return json({ reminder_count, overdue_count, push_sent: pushSent });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendPush(
  supabaseUrl: string,
  pushSecret: string,
  payload: { user_id: string; title: string; body: string; data: Record<string, unknown> }
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-push-secret': pushSecret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(
        `[notify-pfee-reminders] Push HTTP ${res.status} for ${payload.user_id}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[notify-pfee-reminders] Push error for ${payload.user_id}:`, err);
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
