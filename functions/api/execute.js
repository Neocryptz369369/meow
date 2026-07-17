// functions/api/execute.js
// Cloudflare Pages Function.
// Flow: request -> Steel agent (optional) -> GitHub commit -> Cloudflare auto-deploy.
// Nothing is written directly to the live site. All changes land on GitHub first,
// where they can be reviewed and edited, and Cloudflare deploys from GitHub.

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

  const GH_TOKEN = env.GH_TOKEN || env.GITHUB_TOKEN;
  const EXECUTE_SECRET = env.EXECUTE_SECRET;
  const STEEL_URL = env.STEEL_AGENT_URL;
  const STEEL_KEY = env.STEEL_API_KEY;

  // Which repo/branch GitHub commits go to (the site auto-deploys from here)
  const REPO = env.TARGET_REPO || 'Neocryptz369369/meow';
  const BRANCH = env.TARGET_BRANCH || 'main';

  // --- Auth: caller must present the Bearer token ---
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ success: false, error: 'Missing auth token' }, 401);
  }
  if (EXECUTE_SECRET && token !== EXECUTE_SECRET) {
    // If an execute secret is configured, it must match.
    // (Session-token verification can be layered here later if desired.)
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

  // ---------------------------------------------------------------
  // MODE 1: hand the task to the Steel agent.
  // The Steel agent performs the work and commits to GitHub itself,
  // then returns commit info. We just forward and relay.
  // ---------------------------------------------------------------
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
      // Relay whatever the agent returned (should include commit info)
      return json({ success: true, via: 'steel', commit: data.commit || null, result: data });
    } catch (e) {
      return json({ success: false, error: 'Steel agent unreachable', detail: String(e) }, 502);
    }
  }

  // ---------------------------------------------------------------
  // MODE 2: direct file commit to GitHub (visible/editable on GitHub
  // first; Cloudflare auto-deploys from GitHub).
  // action = { path, content, message?, branch? }
  // ---------------------------------------------------------------
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

    // Get existing file sha (if it exists) so we can update it
    let sha = undefined;
    try {
      const getRes = await fetch(apiBase + '?ref=' + encodeURIComponent(targetBranch), { headers: ghHeaders });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }
    } catch (e) { /* new file */ }

    // base64-encode content (handles UTF-8)
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
