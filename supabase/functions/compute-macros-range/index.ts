import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Function 'compute-macros-range' up and running!`);

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, start_date, end_date } = await req.json();

    if (!user_id || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data, error } = await supabaseClient
      .from('v_client_macro_range')
      .select('*')
      .eq('user_id', user_id)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: true });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(String(err?.message ?? err), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
