// Returns all active TikTok product recommendations from Supabase

export async function onRequestGet(context) {
    const env = context.env;

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

  try {
        const res = await fetch(
                `${supabaseUrl}/rest/v1/tiktok_recommendations?is_active=eq.true&order=id`,
          {
                    headers: {
                                'apikey': key,
                                'Authorization': `Bearer ${key}`,
                                'Content-Type': 'application/json'
                    }
          }
              );
        const data = await res.json();
        if (!res.ok) return Response.json({ error: data.message || 'Supabase error' }, { status: 400 });
        return Response.json(data || []);
  } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
  }
}
