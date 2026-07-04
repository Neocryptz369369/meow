// Admin TikTok recommendations CRUD — Cloudflare Pages Function

// Secure admin check — verifies token against Supabase auth API
// (replaces the old local JWT decode which didn't verify signatures)
async function requireAdmin(request, env) {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return { error: 'Missing Authorization header', status: 401 };

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey }
        });
        if (!userRes.ok) return { error: 'Invalid or expired session', status: 401 };
        const user = await userRes.json();
        const email = (user.email || '').toLowerCase();
        const adminEmails = (env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
          .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
        if (!adminEmails.includes(email)) return { error: 'Not authorized as admin', status: 403 };
        return { user: { email, id: user.id } };
  } catch (e) {
        return { error: 'Auth check failed: ' + e.message, status: 500 };
  }
}

export async function onRequest(context) {
    const request = context.request;
    const env = context.env;
    const method = request.method;

  const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

  const sbHeaders = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
  };

  // GET — return all recommendations
  if (method === 'GET') {
        try {
                const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?order=id`, { headers: sbHeaders });
                const data = await res.json();
                if (!res.ok) return Response.json({ error: data.message || 'Supabase error' }, { status: 400 });
                return Response.json(data || []);
        } catch (e) {
                return Response.json({ error: e.message }, { status: 500 });
        }
  }

  if (method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405 });

  let body;
    try { body = await request.json(); } catch (e) { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action, ...rest } = body || {};

  try {
        // upsert — create or update a recommendation
      if (action === 'upsert') {
              const { id, visual_badge_text, product_name, display_headline, destination_url, image_url, is_active } = rest;
              if (!id || !product_name) return Response.json({ error: 'id and product_name required' }, { status: 400 });
              const payload = {
                        id,
                        visual_badge_text: visual_badge_text || '🔥 TikTok',
                        product_name: product_name || 'TikTok Product',
                        display_headline: display_headline || '',
                        destination_url: destination_url || '',
                        image_url: image_url || '',
                        is_active: is_active !== false
              };
              const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations`, {
                        method: 'POST',
                        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
                        body: JSON.stringify(payload)
              });
              if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
              return Response.json({ ok: true });
      }

      // delete — remove a recommendation
      if (action === 'delete') {
              const { id } = rest;
              if (!id) return Response.json({ error: 'id required' }, { status: 400 });
              const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(id)}`, {
                        method: 'DELETE',
                        headers: sbHeaders
              });
              if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
              return Response.json({ ok: true });
      }

      // toggle — set one active, optionally deactivate all others
      if (action === 'toggle') {
              const { id, makeActive } = rest;
              if (!id) return Response.json({ error: 'id required' }, { status: 400 });
              if (makeActive) {
                        await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=neq.${encodeURIComponent(id)}`, {
                                    method: 'PATCH',
                                    headers: sbHeaders,
                                    body: JSON.stringify({ is_active: false })
                        });
              }
              const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        headers: sbHeaders,
                        body: JSON.stringify({ is_active: makeActive })
              });
              if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
              return Response.json({ ok: true });
      }

      return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
  }
}
