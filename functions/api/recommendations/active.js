// Cloudflare Pages Function: GET /api/recommendations/active
// Returns active TikTok recommendations from Supabase, merged with an image map from storage.
const STORAGE_BUCKET = 'tiktok-meta';
const STORAGE_FILE = 'images.json';

function env(context) {
  const e = context.env || {};
  const url = e.SUPABASE_URL || e.neocryptz_final_url || (e.SUPABASE_REF ? 'https://' + e.SUPABASE_REF + '.supabase.co' : '');
  const key = e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_KEY || e.neocryptz_final_anon || '';
  return { url: url.replace(/\/+$/, ''), key };
}

async function fetchImageMap(url, key) {
  try {
    const r = await fetch(url + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + STORAGE_FILE, {
      headers: { 'Authorization': 'Bearer ' + key, 'apikey': key }
    });
    if (!r.ok) return {};
    return await r.json();
  } catch (e) {
    return {};
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const { url, key } = env(context);
  try {
    const r = await fetch(url + '/rest/v1/tiktok_recommendations?select=*&order=id.asc', {
      headers: { 'Authorization': 'Bearer ' + key, 'apikey': key }
    });
    const data = r.ok ? await r.json() : [];
    const imgMap = await fetchImageMap(url, key);
    const merged = (Array.isArray(data) ? data : []).map(row => ({
      ...row,
      image_url: imgMap[row.id] || row.image_url || ''
    }));
    return json(merged, 200);
  } catch (e) {
    return json([{ id: 0, title: '', destination_url: '', image_url: '' }], 200);
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
