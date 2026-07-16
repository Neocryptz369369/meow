// Cloudflare Pages Function: GET /api/recommendations/go?id=<id>
// Looks up a TikTok recommendation and 302-redirects to its destination URL.
function env(context) {
  const e = context.env || {};
  const url = e.SUPABASE_URL || e.neocryptz_final_url || (e.SUPABASE_REF ? 'https://' + e.SUPABASE_REF + '.supabase.co' : '');
  const key = e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_KEY || e.neocryptz_final_anon || '';
  return { url: url.replace(/\/+$/, ''), key };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  const reqUrl = new URL(request.url);
  const id = reqUrl.searchParams.get('id');
  const fallback = reqUrl.searchParams.get('url');
  const { url, key } = env(context);
  let destination = fallback || 'https://www.tiktok.com';
  try {
    if (id) {
      const r = await fetch(url + '/rest/v1/tiktok_recommendations?id=eq.' + encodeURIComponent(id) + '&select=destination_url', {
        headers: { 'Authorization': 'Bearer ' + key, 'apikey': key }
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data[0] && data[0].destination_url) {
          destination = data[0].destination_url;
        }
      }
    }
  } catch (e) {
    // fall through to default destination
  }
  return Response.redirect(destination, 302);
}
