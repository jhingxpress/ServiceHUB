import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RECAPTCHA_SECRET = Deno.env.get('RECAPTCHA_SECRET_KEY');
const MIN_SCORE = 0.5;

interface VerifyRequest {
  token: string;
  action?: string;
}

interface VerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  error?: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    console.error('[verify-recaptcha] RETURNING 405');
    console.error('[verify-recaptcha] reason: Method not allowed');
    console.error('[verify-recaptcha] method:', req.method);
    const response = { error: 'Method not allowed' };
    console.log('[verify-recaptcha] status: 405 body:', JSON.stringify(response));
    return new Response(JSON.stringify(response), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  console.log('[verify-recaptcha] Secret loaded:', !!RECAPTCHA_SECRET, 'Length:', RECAPTCHA_SECRET?.length);
  if (!RECAPTCHA_SECRET) {
    console.error('[verify-recaptcha] RETURNING 500');
    console.error('[verify-recaptcha] reason: RECAPTCHA_SECRET_KEY not configured');
    const response = { error: 'RECAPTCHA_SECRET_KEY not configured' };
    console.log('[verify-recaptcha] status: 500 body:', JSON.stringify(response));
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    console.error('[verify-recaptcha] RETURNING 400');
    console.error('[verify-recaptcha] reason: Invalid JSON body');
    const response = { error: 'Invalid JSON body' };
    console.log('[verify-recaptcha] status: 400 body:', JSON.stringify(response));
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  console.log('[verify-recaptcha] Received request — action:', body.action ?? 'none', 'token present:', !!body.token, 'token length:', body.token?.length);

  if (!body.token) {
    console.error('[verify-recaptcha] RETURNING 400');
    console.error('[verify-recaptcha] reason: Missing recaptcha token');
    console.error('[verify-recaptcha] action:', body.action);
    console.error('[verify-recaptcha] token length:', body.token?.length);
    const response = { error: 'Missing recaptcha token' };
    console.log('[verify-recaptcha] status: 400 body:', JSON.stringify(response));
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Verify with Google
  const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
  const params = new URLSearchParams();
  params.append('secret', RECAPTCHA_SECRET);
  params.append('response', body.token);

  console.log('[verify-recaptcha] Google request — secret present:', !!RECAPTCHA_SECRET, 'response token length:', body.token.length);

  // Forward client IP if available
  const clientIp = req.headers.get('x-forwarded-for') ?? '';
  if (clientIp) {
    params.append('remoteip', clientIp.split(',')[0].trim());
  }

  try {
    const googleRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const googleData = await googleRes.json();
    console.log('[verify-recaptcha] Google raw response:', JSON.stringify(googleData));
    console.log('[verify-recaptcha] Google parsed — success:', googleData.success,
                'score:', googleData.score,
                'action:', googleData.action,
                'hostname:', googleData.hostname,
                'error-codes:', googleData['error-codes'] ?? 'none');

    if (!googleData.success) {
      const errorCodes = googleData['error-codes']?.join(', ') ?? 'unknown';
      console.error('[verify-recaptcha] RETURNING 400');
      console.error('[verify-recaptcha] reason: Google verification failed');
      console.error('[verify-recaptcha] action:', body.action);
      console.error('[verify-recaptcha] token length:', body.token.length);
      console.error('[verify-recaptcha] google success:', googleData.success);
      console.error('[verify-recaptcha] google error-codes:', errorCodes);
      const response = { success: false, error: `reCAPTCHA verification failed: ${errorCodes}` };
      console.log('[verify-recaptcha] status: 400 body:', JSON.stringify(response));
      return new Response(
        JSON.stringify(response),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Check action mismatch
    console.log('[verify-recaptcha] Expected action:', body.action);
    console.log('[verify-recaptcha] Google action:', googleData.action);
    if (body.action && googleData.action && googleData.action !== body.action) {
      console.error('[verify-recaptcha] RETURNING 400');
      console.error('[verify-recaptcha] reason: Action mismatch');
      console.error('[verify-recaptcha] expected action:', body.action);
      console.error('[verify-recaptcha] google action:', googleData.action);
      console.error('[verify-recaptcha] google score:', googleData.score);
      const response = { success: false, error: 'Action mismatch', score: googleData.score };
      console.log('[verify-recaptcha] status: 400 body:', JSON.stringify(response));
      return new Response(
        JSON.stringify(response),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Check score
    const score = googleData.score ?? 0;
    console.log('[verify-recaptcha] Score check — score:', score, 'MIN_SCORE:', MIN_SCORE, 'pass:', score >= MIN_SCORE);
    if (score < MIN_SCORE) {
      console.error('[verify-recaptcha] RETURNING 403');
      console.error('[verify-recaptcha] reason: Low reCAPTCHA score');
      console.error('[verify-recaptcha] action:', googleData.action);
      console.error('[verify-recaptcha] score:', score);
      console.error('[verify-recaptcha] hostname:', googleData.hostname);
      const response = { success: false, error: 'Low reCAPTCHA score', score };
      console.log('[verify-recaptcha] status: 403 body:', JSON.stringify(response));
      return new Response(
        JSON.stringify(response),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    console.log('[verify-recaptcha] RETURNING 200');
    const response: VerifyResponse = {
      success: true,
      score,
      action: googleData.action,
      challenge_ts: googleData.challenge_ts,
      hostname: googleData.hostname,
    };
    console.log('[verify-recaptcha] status: 200 body:', JSON.stringify(response));

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('[verify-recaptcha] RETURNING 500');
    console.error('[verify-recaptcha] reason: Internal verification error');
    console.error('[verify-recaptcha] error:', err);
    const response = { success: false, error: 'Internal verification error' };
    console.log('[verify-recaptcha] status: 500 body:', JSON.stringify(response));
    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
