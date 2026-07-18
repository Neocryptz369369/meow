// functions/api/execute.js
// Cloudflare Pages Function.
// Flow: request -> (optional Steel agent) -> GitHub commit -> Cloudflare auto-deploy.
// Nothing is written directly to the live site. All changes land on GitHub first,
// where they can be reviewed and edited, and Cloudflare deploys from GitHub.
//
// Only an authorized caller may run this:
//   - a request carrying the EXECUTE_SECRET, OR
//   - a logged-in admin user (their Supabase login token is checked).

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

// Confirm the token belongs to a real, logged-in admin user.
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
    // Admin if the logged-in email is in the ADMIN_EMAILS list.
    const ADMIN_EMAILS = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (u.email && ADMIN_EMAILS.includes(String(u.email).toLowerCase())) return true;
    // Treat the user as admin if their profile row is flagged admin.
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
    // If no admin flag is found, deny (safer default).
    return false;
  } catch (e) {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const GH_TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;
  const EXECUTE_SECRET = env.EXECUTE_SECRET;
  const STEEL_URL = env.STEEL_AGENT_URL;
  const STEEL_KEY = env.STEEL_API_KEY;

  const REPO = env.TARGET_REPO || 'Neocryptz369369/meow';
  const BRANCH = env.TARGET_BRANCH || 'main';

  // --- Auth: caller must present the Bearer token ---
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ success: false, error: 'Missing auth token' }, 401);
  }

  // Allow if the token is the execute secret OR a logged-in admin.
  let authorized = false;
  if (EXECUTE_SECRET && token === EXECUTE_SECRET) {
    authorized = true;
  } else {
    authorized = await isAdmin(token, env);
  }
  if (!authorized) {
    return json({ success: false, error: 'Not authorized' }, 403);
  }

  // --- Parse the action ---
  let action;
  try {
    action = await request.json();
  } catch (e) {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }
  if (!action || typeof action !== 'object') {
    return json({ success: false, error: 'Missing action' }, 400);
  }

  const type = action.type || action.action || 'commit';

  // MODE 1: hand the task to the Steel agent (it does the work, we relay the result).
  if (type === 'steel' || type === 'task' || type === 'build') {
    if (!STEEL_URL) {
      return json({ success: false, error: 'Steel agent not configured' }, 500);
    }
    try {
      const sRes = await fetch(STEEL_URL.replace(/\/$/, '') + '/run-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(STEEL_KEY ? { 'Authorization': 'Bearer ' + STEEL_KEY } : {})
        },
        body: JSON.stringify({
          task: action.task || action.prompt || action.instruction || '',
          repo: REPO,
          branch: BRANCH,
          action
        })
      });
      const text = await sRes.text();
      let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      if (!sRes.ok) {
        return json({ success: false, error: 'Steel agent error', status: sRes.status, detail: data }, 502);
      }
      return json({ success: true, via: 'steel', commit: data.commit || null, result: data });
    } catch (e) {
      return json({ success: false, error: 'Steel agent unreachable', detail: String(e) }, 502);
    }
  }

  // MODE 2: direct file commit to GitHub (visible/editable on GitHub first;
  // Cloudflare auto-deploys from GitHub). action = { path, content, message?, branch? }
  if (type === 'commit' || type === 'write' || action.path) {
    if (!GH_TOKEN) {
      return json({ success: false, error: 'GitHub token not configured' }, 500);
    }
    const path = action.path;
    if (!path || typeof action.content !== 'string') {
      return json({ success: false, error: 'commit needs { path, content }' }, 400);
    }
    const message = action.message || ('Update ' + path);
    const targetBranch = action.branch || BRANCH;

    const apiBase = 'https://api.github.com/repos/' + REPO + '/contents/' + encodeURI(path);
    const ghHeaders = {
      'Authorization': 'Bearer ' + GH_TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'neocryptz-execute'
    };

    let sha = undefined;
    try {
      const getRes = await fetch(apiBase + '?ref=' + encodeURIComponent(targetBranch), { headers: ghHeaders });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }
    } catch (e) { /* new file */ }

    let b64;
    try {
      b64 = btoa(unescape(encodeURIComponent(action.content)));
    } catch (e) {
      return json({ success: false, error: 'Could not encode content' }, 400);
    }

    try {
      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: b64,
          branch: targetBranch,
          ...(sha ? { sha } : {})
        })
      });
      const data = await putRes.json();
      if (!putRes.ok) {
        return json({ success: false, error: 'GitHub commit failed', detail: data }, 502);
      }
      return json({
        success: true,
        via: 'github',
        commit: {
          sha: data.commit && data.commit.sha,
          url: data.commit && data.commit.html_url,
          path
        }
      });
    } catch (e) {
      return json({ success: false, error: 'GitHub request failed', detail: String(e) }, 502);
    }
  }

  return json({ success: false, error: 'Unknown action type: ' + type }, 400);
}
