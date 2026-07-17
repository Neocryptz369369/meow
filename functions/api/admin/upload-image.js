// functions/api/admin/upload-image.js
// Cloudflare Pages Function -- faithful copy of the original upload-image behavior.
// Uploads an admin image into the existing Supabase Storage bucket "tiktok-meta".
// Input:  { data (a data:image/...;base64,... string), fileName, contentType }
// Output: { success, url }  where url is the public URL of the uploaded image.
// TikTok image behavior is unchanged -- same bucket, same public URL, same naming style.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const BUCKET = 'tiktok-meta';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Turn a base64 string into raw bytes.
function base64ToBytes(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const SUPABASE_URL = env.SUPABASE_URL || env.neocryptz_final_url;
  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: false, error: 'Storage not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  let data = body && body.data;
  const contentTypeIn = (body && body.contentType) || 'image/png';
  let fileName = (body && body.fileName) || (Date.now() + '.png');

  if (!data || typeof data !== 'string') {
    return json({ success: false, error: 'Image data is required' }, 400);
  }

  // Accept either a full "data:image/...;base64,XXXX" string or a bare base64 string.
  let contentType = contentTypeIn;
  const match = data.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    contentType = match[1] || contentTypeIn;
    data = match[2];
  }

  let bytes;
  try {
    bytes = base64ToBytes(data);
  } catch (e) {
    return json({ success: false, error: 'Could not decode image data' }, 400);
  }

  // Keep a unique, time-ordered name (same style as before).
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = Date.now() + '-' + safeName;

  const putUrl = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + objectPath;

  try {
    const upRes = await fetch(putUrl, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: bytes
    });
    if (!upRes.ok) {
      const t = await upRes.text();
      return json({ success: false, error: 'Upload failed', detail: t }, 502);
    }
  } catch (e) {
    return json({ success: false, error: 'Upload request failed' }, 502);
  }

  const publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + objectPath;
  return json({ success: true, url: publicUrl, path: objectPath });
}
