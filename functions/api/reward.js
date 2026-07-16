// functions/api/reward.js
// Cloudflare Pages Function: watch-ad reward -> +5 credits
// Verifies the caller's Supabase auth token, then adds 5 credits to their row.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

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
  const ANON_KEY = env.neocryptz_final_anon || env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: false, error: 'Server not configured' }, 500);
  }

  // Extract Bearer token from the caller
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ success: false, error: 'Missing auth token' }, 401);
  }

  // Verify the token with Supabase Auth and get the user
  let userId = null;
  try {
    const uRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': ANON_KEY
      }
    });
    if (!uRes.ok) {
      return json({ success: false, error: 'Invalid session' }, 401);
    }
    const u = await uRes.json();
    userId = u && u.id;
  } catch (e) {
    return json({ success: false, error: 'Auth check failed' }, 401);
  }

  if (!userId) {
    return json({ success: false, error: 'Invalid session' }, 401);
  }

  const REWARD = 5;

  // Read current credits (service key bypasses RLS)
  let current = 0;
  try {
    const rRes = await fetch(
      SUPABASE_URL + '/rest/v1/users?id=eq.' + encodeURIComponent(userId) + '&select=credits',
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY
        }
      }
    );
    const rows = await rRes.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].credits != null) {
      current = Number(rows[0].credits) || 0;
    }
  } catch (e) {
    return json({ success: false, error: 'Could not read balance' }, 500);
  }

  const newCredits = current + REWARD;

  // Write the new balance back
  try {
    const wRes = await fetch(
      SUPABASE_URL + '/rest/v1/users?id=eq.' + encodeURIComponent(userId),
      {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ credits: newCredits })
      }
    );
    if (!wRes.ok) {
      const t = await wRes.text();
      return json({ success: false, error: 'Update failed', detail: t }, 500);
    }
  } catch (e) {
    return json({ success: false, error: 'Could not update balance' }, 500);
  }

  return json({ success: true, newCredits, added: REWARD });
}
