// functions/api/run-code.js
// Cloudflare Pages Function: /api/run-code
//
// Runs a code snippet in an external sandbox (Piston: https://github.com/engineer-man/piston)
// and returns the output. This is the "code execution" building block — nothing in
// chat.js or index.html calls this yet, so it can't affect the live chat until it's
// wired up deliberately (that's the Step 2 you'll review separately).
//
// Locked to admin-only for now, same pattern as execute.js (Bearer token must be
// either EXECUTE_SECRET or a logged-in admin's Supabase token). Loosen this
// deliberately later if/when you want regular users' chats to be able to trigger it —
// don't just remove the gate, replace it with a real per-user rate limit first, since
// an open code-execution endpoint is an easy thing to abuse for free compute.

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

// Same admin check as execute.js — kept identical on purpose so both endpoints agree
// on who counts as an admin.
async function isAdmin(token, env) {
  const SUPABASE_URL = env.SUPABASE_URL || env.neocryptz_final_url;
  const ANON_KEY = env.neocryptz_final_anon || env.SUPABASE_KEY;
  if (!SUPABASE_URL || !token) return false;
  try {
    const uRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': ANON_KEY }
    });
    if (!uRes.ok) return false;
    const u = await uRes.json();
    if (!u || !u.id) return false;
    const ADMIN_EMAILS = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (u.email && ADMIN_EMAILS.includes(String(u.email).toLowerCase())) return true;
    const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    if (SERVICE_KEY) {
      const rRes = await fetch(
        SUPABASE_URL + '/rest/v1/users?id=eq.' + encodeURIComponent(u.id) + '&select=is_admin,role,admin',
        { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
      );
      if (rRes.ok) {
        const rows = await rRes.json();
        if (Array.isArray(rows) && rows.length) {
          const r = rows[0];
          if (r.is_admin === true || r.admin === true || r.role === 'admin') return true;
        }
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

const ALLOWED_LANGUAGES = {
  javascript: 'javascript', js: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  python: 'python', py: 'python',
  bash: 'bash', shell: 'bash'
};
const MAX_CODE_LENGTH = 20000;
const EXECUTION_TIMEOUT_MS = 15000;

export async function onRequestPost(context) {
  const { request, env } = context;

  const EXECUTE_SECRET = env.EXECUTE_SECRET;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ success: false, error: 'Missing auth token' }, 401);
  }
  let authorized = false;
  if (EXECUTE_SECRET && token === EXECUTE_SECRET) {
    authorized = true;
  } else {
    authorized = await isAdmin(token, env);
  }
  if (!authorized) {
    return json({ success: false, error: 'Not authorized' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const language = ALLOWED_LANGUAGES[String(body.language || '').toLowerCase()];
  if (!language) {
    return json({
      success: false,
      error: `Unsupported language "${body.language}". Supported: ${Object.keys(ALLOWED_LANGUAGES).join(', ')}`
    }, 400);
  }

  const code = body.code;
  if (typeof code !== 'string' || code.length === 0) {
    return json({ success: false, error: 'No code provided.' }, 400);
  }
  if (code.length > MAX_CODE_LENGTH) {
    return json({ success: false, error: `Code too long (${code.length} chars, max ${MAX_CODE_LENGTH}).` }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

  try {
    const res = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        version: '*',
        files: [{ content: code }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      return json({ success: false, error: `Sandbox request failed: HTTP ${res.status}` }, 502);
    }

    const data = await res.json();
    return json({
      success: true,
      stdout: truncate(data.run && data.run.stdout ? data.run.stdout : ''),
      stderr: truncate(data.run && data.run.stderr ? data.run.stderr : ''),
      exit_code: data.run ? data.run.code : null
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      return json({ success: false, error: `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms.` }, 504);
    }
    return json({ success: false, error: 'Sandbox error: ' + String(e) }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function truncate(str, max) {
  max = max || 4000;
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n...[truncated, ${str.length - max} more characters]`;
}
