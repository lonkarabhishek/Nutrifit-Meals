import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Function 'request-pause' up and running!`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { subscription_id, start_date, end_date, reason } = await req.json();

    if (!subscription_id || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 1. Verify ownership or admin role
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subscription_id)
      .single();

    if (subError) throw new Error('Subscription not found.');

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (subscription.user_id !== user.id && profile?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
        });
    }

    // 2. Insert the pause request (DB trigger will handle overlap and day limit checks)
    const { data: pauseData, error: pauseError } = await supabase.from('pauses').insert({
      subscription_id,
      start_date,
      end_date,
      reason,
      created_by: user.id,
    }).select().single();

    if (pauseError) throw pauseError;

    // 3. Update deliveries in the paused range
    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'skipped_paused' })
      .eq('subscription_id', subscription_id)
      .gte('date', start_date)
      .lte('date', end_date);

    if (updateError) {
      // If this fails, we should ideally roll back the pause insertion.
      // For now, we log the error.
      console.error('Failed to update deliveries, but pause was created:', updateError.message);
    }

    return new Response(JSON.stringify(pauseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });

  } catch (err) {
    return new Response(String(err?.message ?? err), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
