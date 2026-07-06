// Cloudflare Workers don't have Node's Buffer — these helpers replace it
function base64Decode(str) {
    return new TextDecoder().decode(
          Uint8Array.from(atob(str.replace(/\s/g, '')), c => c.charCodeAt(0))
        );
}

function base64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

  // Security: require internal secret header
  // Only chat.js (server-side) knows this secret, it's never exposed to
  // the browser. This prevents anyone on the internet from calling
  // /api/execute directly and pushing arbitrary code to GitHub.
  const executeSecret = request.headers.get('x-execute-secret');
    if (!executeSecret || executeSecret !== env.EXECUTE_SECRET) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const token = env.GH_TOKEN;
    if (!token) return Response.json({ error: 'GitHub token not configured on server.' }, { status: 500 });

  let body;
    try {
          body = await request.json();
    } catch (e) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

  const { action, repo, path, inject, position, content, message, find, replace, url } = body || {};

  const ghHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
  };

  try {
        if (action === 'list_repos') {
                const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=pushed', { headers: ghHeaders });
                const data = await r.json();
                if (!Array.isArray(data)) return Response.json({ error: data.message || 'Could not list repos.' }, { status: 500 });
                const repos = data.map(rp => ({ name: rp.name, full_name: rp.full_name, pushed_at: rp.pushed_at?.slice(0, 10) }));
                return Response.json({ repos });
        }

      if (action === 'read_file_excerpt') {
              if (!repo || !path) return Response.json({ error: 'Missing repo or path.' }, { status: 400 });
              const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
              const data = await r.json();
              if (!data.content) return Response.json({ error: `File not found: ${path} in ${repo}` }, { status: 404 });
              const full = base64Decode(data.content);
              const excerpt = full.length > 6000
                ? full.slice(0, 3000) + '\n\n...[TRUNCATED — file is ' + full.length + ' chars]...\n\n' + full.slice(-1500)
                        : full;
              return Response.json({ excerpt, sha: data.sha, size: full.length });
      }

      if (action === 'inject_html') {
              if (!repo || !path || !inject) return Response.json({ error: 'Missing repo, path, or inject content.' }, { status: 400 });

          const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
              const data = await r.json();
              if (!data.content) return Response.json({ error: `File not found: ${path} in ${repo}` }, { status: 404 });

          let fileText = base64Decode(data.content);
              const sha = data.sha;
              const pos = position || 'before_closing_body';

          if (pos === 'before_closing_body') {
                    if (!fileText.includes('</body>')) return Response.json({ error: 'No </body> tag found in file.' }, { status: 400 });
                    fileText = fileText.replace('</body>', inject + '\n</body>');
          } else if (pos === 'before_closing_head') {
                    if (!fileText.includes('</head>')) return Response.json({ error: 'No </head> tag found in file.' }, { status: 400 });
                    fileText = fileText.replace('</head>', inject + '\n</head>');
          } else if (pos === 'after_opening_body') {
                    fileText = fileText.replace(/<body([^>]*)>/, (m) => m + '\n' + inject);
          } else {
                    return Response.json({ error: 'Unknown position: ' + pos }, { status: 400 });
          }

          const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: ghHeaders,
                    body: JSON.stringify({
                                message: message || 'Inject HTML via Neocryptz AI',
                                content: base64Encode(fileText),
                                sha
                    })
          });
              const pushData = await pushRes.json();
              if (pushData.commit) {
                        return Response.json({
                                    success: true,
                                    commit: pushData.commit.sha,
                                    repo,
                                    path,
                                    message: `✅ Pushed to ${repo}/${path} — Cloudflare will redeploy in ~30 seconds.`
                        });
              }
              return Response.json({ error: pushData.message || 'GitHub push failed.' }, { status: 500 });
      }

      if (action === 'patch_file') {
              if (!repo || !path || !find) return Response.json({ error: 'Missing repo, path, or find string.' }, { status: 400 });

          const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
              const data = await r.json();
              if (!data.content) return Response.json({ error: `File not found: ${path} in ${repo}` }, { status: 404 });

          let fileText = base64Decode(data.content);
              if (!fileText.includes(find)) return Response.json({ error: 'Search string not found in file.' }, { status: 400 });
              fileText = fileText.replace(find, replace || '');

          const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: ghHeaders,
                    body: JSON.stringify({
                                message: message || 'Patch file via Neocryptz AI',
                                content: base64Encode(fileText),
                                sha: data.sha
                    })
          });
              const pushData = await pushRes.json();
              if (pushData.commit) {
                        return Response.json({
                                    success: true,
                                    commit: pushData.commit.sha,
                                    message: `✅ Patched ${repo}/${path} — Cloudflare will redeploy in ~30 seconds.`
                        });
              }
              return Response.json({ error: pushData.message || 'GitHub push failed.' }, { status: 500 });
      }

      if (action === 'push_file') {
              if (!repo || !path || content === undefined) return Response.json({ error: 'Missing repo, path, or content.' }, { status: 400 });

          let sha;
              try {
                        const shaRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
                        const shaData = await shaRes.json();
                        sha = shaData.sha;
              } catch (_) {}

          const pushBody = {
                    message: message || 'Update file via Neocryptz AI',
                    content: base64Encode(content)
          };
              if (sha) pushBody.sha = sha;

          const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: ghHeaders,
                    body: JSON.stringify(pushBody)
          });
              const pushData = await pushRes.json();
              if (pushData.commit) {
                        return Response.json({
                                    success: true,
                                    commit: pushData.commit.sha,
                                    message: `✅ Pushed ${path} to ${repo} — Cloudflare will redeploy in ~30 seconds.`
                        });
              }
              return Response.json({ error: pushData.message || 'GitHub push failed.' }, { status: 500 });
      }

        if (action === 'redeploy') {
                        const cfToken = env.CF_API_TOKEN;
                        if (!cfToken) return Response.json({ error: 'CF_API_TOKEN not configured on server.' }, { status: 500 });
                        const deployRes = await fetch('https://api.cloudflare.com/client/v4/accounts/35078329dfee4f3908f4b41ccde638a9/pages/projects/meow/deployments', {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${cfToken}` }
                        });
                        const deployData = await deployRes.json();
                        if (deployData.success) {
                                            return Response.json({
                                                                    success: true,
                                                                    deployment_id: deployData.result?.id,
                                                                    message: '✅ Redeploy triggered — Cloudflare is building the latest commit now.'
                                            });
                        }
                        return Response.json({ error: deployData.errors?.[0]?.message || 'Cloudflare redeploy failed.' }, { status: 500 });
        }
      
              if (action === 'browse_page') {
                              const cfToken = env.CF_API_TOKEN;
                              if (!cfToken) return Response.json({ error: 'CF_API_TOKEN not configured on server.' }, { status: 500 });
                              if (!url) return Response.json({ error: 'Missing url.' }, { status: 400 });
                              const browseRes = await fetch('https://api.cloudflare.com/client/v4/accounts/35078329dfee4f3908f4b41ccde638a9/browser-rendering/markdown', {
                                                  method: 'POST',
                                                  headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ url })
                              });
                              const browseData = await browseRes.json();
                              if (browseData.success !== false && browseData.result) {
                                                  return Response.json({
                                                                          success: true,
                                                                          action: 'browse_page',
                                                                          url,
                                                                          content: String(browseData.result).slice(0, 8000),
                                                                          message: `Read ${url}`
                                                  });
                              }
                              return Response.json({ error: browseData.errors?.[0]?.message || 'Failed to browse page.' }, { status: 500 });
              }

              return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });

  } catch (err) {
        return Response.json({ error: 'Execution error: ' + err.message }, { status: 500 });
  }
}
