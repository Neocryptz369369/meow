// functions/api/deploy-status.js
// Cloudflare Pages Function.
// Tells the site whether the build for a given GitHub commit worked yet.
// Input:  { repo, commit_sha }   (repo defaults to the meow repo)
// Output: { state, url }         state is one of: pending / success / failure

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
  const DEFAULT_REPO = env.TARGET_REPO || 'Neocryptz369369/meow';

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ state: 'error', error: 'Invalid JSON body' }, 400);
  }

  const repo = (body && body.repo) || DEFAULT_REPO;
  const commit_sha = body && body.commit_sha;
  if (!commit_sha) {
    return json({ state: 'error', error: 'commit_sha is required' }, 400);
  }

  const ghHeaders = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'neocryptz-deploy-status',
    ...(GH_TOKEN ? { 'Authorization': 'Bearer ' + GH_TOKEN } : {})
  };

  let combinedState = 'pending';
  let targetUrl = null;

  // 1) Combined commit status (older-style status checks)
  try {
    const sRes = await fetch(
      'https://api.github.com/repos/' + repo + '/commits/' + commit_sha + '/status',
      { headers: ghHeaders }
    );
    if (sRes.ok) {
      const s = await sRes.json();
      if (s && s.state) combinedState = s.state; // pending / success / failure
      if (s && Array.isArray(s.statuses) && s.statuses.length) {
        const withUrl = s.statuses.find(function (x) { return x.target_url; });
        if (withUrl) targetUrl = withUrl.target_url;
      }
    }
  } catch (e) { /* ignore, fall through */ }

  // 2) Check-runs (newer-style GitHub Checks) — refine the state if present
  try {
    const cRes = await fetch(
      'https://api.github.com/repos/' + repo + '/commits/' + commit_sha + '/check-runs',
      { headers: ghHeaders }
    );
    if (cRes.ok) {
      const c = await cRes.json();
      const runs = (c && c.check_runs) || [];
      if (runs.length) {
        const anyRunning = runs.some(function (r) { return r.status !== 'completed'; });
        const anyFailed = runs.some(function (r) {
          return r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'neutral' && r.conclusion !== 'skipped';
        });
        if (anyFailed) combinedState = 'failure';
        else if (anyRunning) combinedState = 'pending';
        else combinedState = 'success';
        if (!targetUrl) {
          const runWithUrl = runs.find(function (r) { return r.html_url; });
          if (runWithUrl) targetUrl = runWithUrl.html_url;
        }
      }
    }
  } catch (e) { /* ignore */ }

  return json({ state: combinedState, url: targetUrl, repo: repo, commit_sha: commit_sha });
}
