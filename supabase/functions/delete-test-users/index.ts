import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAILS = [
  'ymircorbz@gmail.com',
  'maereprtty2@gmail.com',
  'opnnetflix2020@gmail.com',
  'ymirasia037@gmail.com',
  'dsppo.plansopns.pnp@gmail.com',
  'corbetaraj@gmail.com',
  'corbetaeugenio@gmail.com',
  'amarykristen02@gmail.com',
  'amarykristen03@gmail.com',
  'amarykristen@gmail.com',
  'pristontalephp@gmail.com',
  'arnoldcorbeta1976@gmail.com',
];

Deno.serve(async (req) => {
  // Basic auth check: pass ?key=YOUR_SECRET
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key !== Deno.env.get('DELETE_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results: Record<string, string> = {};

  for (const email of EMAILS) {
    try {
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listError) throw listError;

      const user = users.users.find((u: any) => u.email === email);
      if (!user) {
        results[email] = 'not_found';
        continue;
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
      results[email] = 'deleted';
    } catch (err: any) {
      results[email] = `error: ${err.message}`;
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});
