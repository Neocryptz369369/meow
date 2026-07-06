// Returns all active TikTok product recommendations from Supabase, plus the global randomize setting

export async function onRequestGet(context) {
        const env = context.env;

    const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
        const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
        if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

    const sbHeaders = {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
    };

    try {
                const res = await fetch(
                                `${supabaseUrl}/rest/v1/tiktok_recommendations?is_active=eq.true&order=sort_order.asc.nullslast,id.asc`,
                    { headers: sbHeaders }
                            );
                const data = await res.json();
                if (!res.ok) return Response.json({ error: data.message || 'Supabase error' }, { status: 400 });

            let randomize = true;
                try {
                                const setRes = await fetch(`${supabaseUrl}/rest/v1/app_settings?key=eq.tiktok_randomize&select=value`, { headers: sbHeaders });
                                const setData = await setRes.json();
                                if (Array.isArray(setData) && setData[0]) randomize = setData[0].value === 'true';
                } catch (e) {}

            return Response.json({ ads: data || [], randomize });
    } catch (e) {
                return Response.json({ error: e.message }, { status: 500 });
    }
}
