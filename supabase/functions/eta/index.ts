import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Function 'eta' up and running!`);

// Haversine formula to calculate distance between two lat/lng points
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        0.5 - Math.cos(dLat) / 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { driver_id, client_address_id } = await req.json();

    if (!driver_id || !client_address_id) {
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

    // 1. Get driver's latest location
    const { data: driverLocation, error: driverError } = await supabase
      .from('driver_locations')
      .select('lat, lng')
      .eq('driver_id', driver_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (driverError) throw new Error('Driver location not found.');

    // 2. Get client's address
    const { data: clientAddress, error: addressError } = await supabase
      .from('addresses')
      .select('lat, lng')
      .eq('id', client_address_id)
      .single();

    if (addressError) throw new Error('Client address not found.');

    if (!driverLocation.lat || !driverLocation.lng || !clientAddress.lat || !clientAddress.lng) {
        throw new Error('Invalid location data for driver or client.');
    }

    // 3. Calculate distance and ETA
    const distanceKm = getDistance(driverLocation.lat, driverLocation.lng, clientAddress.lat, clientAddress.lng);
    const avgSpeedKmph = parseFloat(Deno.env.get('DEFAULT_AVG_SPEED_KMPH') || '20');
    const etaMinutes = Math.round((distanceKm / avgSpeedKmph) * 60);

    let statusLabel = 'Arriving';
    if (etaMinutes < 2) {
        statusLabel = 'Arriving soon';
    } else if (etaMinutes > 30) {
        statusLabel = 'Out for delivery';
    }

    return new Response(JSON.stringify({ eta_minutes: etaMinutes, status: statusLabel, distance_km: distanceKm }), {
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
