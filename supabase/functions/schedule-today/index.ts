import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Function 'schedule-today' up and running!`);

// Note: Supabase cron jobs use UTC time.
// 00:05 IST is 18:35 UTC the previous day.

// Helper to get date parts in Asia/Kolkata timezone
function getKolkataDateParts(date: Date) {
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', weekday: 'iso' as any, week: 'numeric' as any, year: 'numeric', month: 'numeric', day: 'numeric' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);
  const get = (part: string) => parts.find(p => p.type === part)?.value || '';
  return {
    isoDow: parseInt(get('weekday')),
    date: `${get('year')}-${get('month')}-${get('day')}`
  };
}

// Helper to determine menu week number (1 or 2)
function getMenuWeek(date: Date): number {
    const isoWeek = getISOWeek(date);
    return (isoWeek % 2 === 0) ? 2 : 1;
}

function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date();
    const { isoDow, date: todayStr } = getKolkataDateParts(today);

    // Sundays are off
    if (isoDow === 7) {
      return new Response(JSON.stringify({ message: 'Sunday, no deliveries scheduled.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Materialize today's menu instance if it doesn't exist
    const menuWeek = getMenuWeek(today);
    const { data: existingMenu } = await supabaseAdmin.from('menu_instances').select('id').eq('date', todayStr).single();

    if (!existingMenu) {
      const { data: template, error: templateError } = await supabaseAdmin
        .from('menu_templates')
        .select('recipe_id, meal_slot')
        .eq('week_no', menuWeek)
        .eq('dow', isoDow)
        .single();

      if (templateError) throw new Error(`Failed to find menu template for week ${menuWeek}, DOW ${isoDow}: ${templateError.message}`);

      const { error: menuInsertError } = await supabaseAdmin.from('menu_instances').insert({
        date: todayStr,
        week_no: menuWeek,
        recipe_id: template.recipe_id,
        meal_slot: template.meal_slot,
      });
      if (menuInsertError) throw new Error(`Failed to insert menu instance: ${menuInsertError.message}`);
    }

    // 2. Get active subscriptions
    const { data: subscriptions, error: subsError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('status', 'active');

    if (subsError) throw subsError;

    // 3. Get pauses for today
    const { data: pauses, error: pausesError } = await supabaseAdmin
      .from('pauses')
      .select('subscription_id')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr);

    if (pausesError) throw pausesError;
    const pausedSubIds = new Set(pauses.map(p => p.subscription_id));

    // 4. Create delivery records
    const deliveriesToInsert = subscriptions
      .filter(sub => !pausedSubIds.has(sub.id))
      .map(sub => ({
        subscription_id: sub.id,
        date: todayStr,
        status: 'scheduled',
        meal_slot: 'lunch', // Assuming default
      }));

    if (deliveriesToInsert.length > 0) {
        const { error: deliveryInsertError } = await supabaseAdmin.from('deliveries').insert(deliveriesToInsert);
        if (deliveryInsertError) throw new Error(`Failed to insert deliveries: ${deliveryInsertError.message}`);
    }

    return new Response(JSON.stringify({ message: `Processed ${deliveriesToInsert.length} deliveries.` }), {
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
