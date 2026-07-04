// @ts-nocheck
// Supabase Edge Function — reset-staff-password
// Allows an admin to reset a staff account's password to a temporary one.
// Deploy: supabase functions deploy reset-staff-password
// Deno runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResetStaffPayload {
  user_id: string;
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*';

function generateTemporaryPassword(): string {
  const chars = UPPER + LOWER + DIGITS + SPECIAL;
  const length = 10;
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  password = `${UPPER[array[0] % UPPER.length]}${LOWER[array[1] % LOWER.length]}${DIGITS[array[2] % DIGITS.length]}${SPECIAL[array[3] % SPECIAL.length]}${password.slice(4)}`;
  return password;
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const payload: ResetStaffPayload = await req.json();
    const { user_id } = payload;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authClient = createClient(supabaseUrl, anonKey ?? serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adminId = userData.user.id;

    const { data: adminProfile } = await authClient
      .from('users')
      .select('role')
      .eq('id', adminId)
      .single();

    if (adminProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only admin can reset staff passwords' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: targetProfile } = await authClient
      .from('users')
      .select('role')
      .eq('id', user_id)
      .single();

    const staffRoles = ['moderator', 'support_agent', 'operations_staff'];
    if (!targetProfile || !staffRoles.includes(targetProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Target user is not a staff account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const temporaryPassword = generateTemporaryPassword();

    const { error: updateError } = await serviceClient.auth.admin.updateUserById(user_id, {
      password: temporaryPassword,
    });

    if (updateError) {
      console.error('[reset-staff-password] auth update error:', updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: profileError } = await serviceClient
      .from('users')
      .update({ must_change_password: true, updated_at: new Date().toISOString() })
      .eq('id', user_id);

    if (profileError) {
      console.error('[reset-staff-password] profile update error:', profileError);
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await serviceClient.from('staff_action_log').insert({
      staff_id: adminId,
      action: 'reset_staff_password',
      target_table: 'users',
      target_record_id: user_id,
      notes: 'Admin reset staff password; temporary password issued',
    });

    return new Response(
      JSON.stringify({ success: true, user_id, temporary_password: temporaryPassword }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[reset-staff-password] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
