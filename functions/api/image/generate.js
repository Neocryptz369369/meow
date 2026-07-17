// functions/api/image/generate.js
// Cloudflare Pages Function.
// Makes an image with Pollinations (free, no API limits), saves it into
// Supabase Storage under the "generated/" folder, and keeps a ROLLING CAP of
// exactly 500 images: when a new one is added past 500, the oldest is deleted
// so the new image replaces it. Always at most 500 generated images.
//
// Your TikTok files in the same bucket are NOT touched -- generated images live
// only in the separate "generated/" folder.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const BUCKET = 'tiktok-meta';   // existing bucket
const FOLDER = 'generated';     // isolated folder for AI-made images
const MAX_IMAGES = 500;         // rolling cap

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const SUPABASE_URL = env.SUPABASE_URL || env.neocryptz_final_url;
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const prompt = body && (body.prompt || body.text);
  if (!prompt || typeof prompt !== 'string') {
    return json({ success: false, error: 'A prompt is required' }, 400);
  }
  const width = Number(body.width) || 1024;
  const height = Number(body.height) || 1024;

  // 1) Make the image with Pollinations (free).
  const pollUrl =
    'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
    '?width=' + width + '&height=' + height + '&nologo=true';

  let imgBytes, contentType = 'image/jpeg';
  try {
    const imgRes = await fetch(pollUrl);
    if (!imgRes.ok) {
      return json({ success: false, error: 'Image service failed', status: imgRes.status }, 502);
    }
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    imgBytes = await imgRes.arrayBuffer();
  } catch (e) {
    return json({ success: false, error: 'Could not reach image service' }, 502);
  }

  // If Supabase storage is not configured, just return the Pollinations URL.
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: true, imageUrl: pollUrl, stored: false });
  }

  const ext = contentType.indexOf('png') !== -1 ? 'png' : 'jpg';
  const fileName = FOLDER + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

  const storageBase = SUPABASE_URL + '/storage/v1/object';
  const authHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };

  // 2) Upload the new image.
  let publicUrl = null;
  try {
    const upRes = await fetch(storageBase + '/' + BUCKET + '/' + fileName, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: imgBytes
    });
    if (!upRes.ok) {
      const t = await upRes.text();
      // Upload failed but image still exists at Pollinations -- return that.
      return json({ success: true, imageUrl: pollUrl, stored: false, note: 'store failed', detail: t });
    }
    publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + fileName;
  } catch (e) {
    return json({ success: true, imageUrl: pollUrl, stored: false });
  }

  // 3) Enforce the rolling 500 cap on the generated/ folder only.
  try {
    const listRes = await fetch(storageBase.replace('/object', '') + '/object/list/' + BUCKET, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: FOLDER,
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }   // name starts with Date.now() -> oldest first
      })
    });
    if (listRes.ok) {
      const files = await listRes.json();
      const names = (Array.isArray(files) ? files : [])
        .filter(function (f) { return f && f.name; })
        .map(function (f) { return f.name; })
        .sort(); // ascending -> oldest (smallest timestamp) first
      const overflow = names.length - MAX_IMAGES;
      if (overflow > 0) {
        const toDelete = names.slice(0, overflow).map(function (n) { return FOLDER + '/' + n; });
        await fetch(storageBase + '/' + BUCKET, {
          method: 'DELETE',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: toDelete })
        });
      }
    }
  } catch (e) {
    // Cap enforcement is best-effort; never fail the whole request over cleanup.
  }

  return json({ success: true, imageUrl: publicUrl || pollUrl, stored: !!publicUrl });
}
