// Cloudflare Workers don't have Node's Buffer — these helpers replace it
function base64Decode(str) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(str.replace(/\s/g, '')), c => c.charCodeAt(0))
  )
}

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function readBody(res) {
  const raw = await res.text()
  let json = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch (e) {
    json = null
  }
  return { ok: res.ok, status: res.status, json, raw }
}

function ghError(body, fallback) {
  if (body.json && body.json.message) return body.json.message
  if (body.raw && body.raw.trim()) return body.raw.trim().slice(0, 300)
  return fallback + ' (HTTP ' + body.status + ')'
}

function contentsUrl(repo, filePath, ref) {
  const base = `https://api.github.com/repos/${repo}/contents/${filePath}`
  if (!ref) return base
  return base + `?ref=${encodeURIComponent(ref)}`
}

async function getRepoInfo(repo, headers) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers })
  const body = await readBody(res)
  if (!body.ok || !body.json) {
    throw new Error(ghError(body, `Could not load repository metadata for ${repo}.`))
  }
  return body.json
}

async function getBranchSha(repo, headers, baseBranch, baseSha) {
  if (baseSha) return baseSha
  const repoInfo = await getRepoInfo(repo, headers)
  const branchName = baseBranch || repoInfo.default_branch
  const res = await fetch(`https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branchName)}`, { headers })
  const body = await readBody(res)
  if (!body.ok || !body.json || !body.json.commit || !body.json.commit.sha) {
    throw new Error(ghError(body, `Could not resolve branch ${branchName} in ${repo}.`))
  }
  return body.json.commit.sha
}

async function listBranches(repo, headers, protectedOnly, perPage, page) {
  const params = new URLSearchParams()
  if (protectedOnly !== undefined && protectedOnly !== null) params.set('protected', String(protectedOnly))
  if (perPage) params.set('per_page', String(perPage))
  if (page) params.set('page', String(page))
  const qs = params.toString()
  const res = await fetch(`https://api.github.com/repos/${repo}/branches${qs ? `?${qs}` : ''}`, { headers })
  const body = await readBody(res)
  if (!body.ok || !Array.isArray(body.json)) {
    throw new Error(ghError(body, `Could not list branches for ${repo}.`))
  }
  return body.json.map(branch => ({
    name: branch.name,
    sha: branch.commit && branch.commit.sha,
    protected: branch.protected
  }))
}

async function listPullRequests(repo, headers, state, head, base, sort, direction, perPage, page) {
  const params = new URLSearchParams()
  if (state) params.set('state', state)
  if (head) params.set('head', head)
  if (base) params.set('base', base)
  if (sort) params.set('sort', sort)
  if (direction) params.set('direction', direction)
  if (perPage) params.set('per_page', String(perPage))
  if (page) params.set('page', String(page))
  const qs = params.toString()
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls${qs ? `?${qs}` : ''}`, { headers })
  const body = await readBody(res)
  if (!body.ok || !Array.isArray(body.json)) {
    throw new Error(ghError(body, `Could not list pull requests for ${repo}.`))
  }
  return body.json.map(pr => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    head: pr.head && pr.head.ref,
    base: pr.base && pr.base.ref,
    html_url: pr.html_url,
    updated_at: pr.updated_at
  }))
}

async function createBranch(repo, headers, branch, baseBranch, baseSha) {
  const sha = await getBranchSha(repo, headers, baseBranch, baseSha)
  const res = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha
    })
  })
  const body = await readBody(res)
  if (!body.ok || !body.json || !body.json.ref) {
    throw new Error(ghError(body, `Could not create branch ${branch} in ${repo}.`))
  }
  return {
    branch,
    ref: body.json.ref,
    sha,
    url: body.json.url || null
  }
}

async function createPullRequest(repo, headers, title, head, base, bodyText, draft) {
  const payload = { title, head, base, draft: draft === undefined ? true : !!draft }
  if (bodyText !== undefined && bodyText !== null && bodyText !== '') payload.body = bodyText
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  const body = await readBody(res)
  if (!body.ok || !body.json || !body.json.number) {
    throw new Error(ghError(body, `Could not create pull request in ${repo}.`))
  }
  return {
    number: body.json.number,
    html_url: body.json.html_url,
    state: body.json.state,
    draft: body.json.draft,
    head: body.json.head && body.json.head.ref,
    base: body.json.base && body.json.base.ref
  }
}

async function readRepoFile(repo, headers, filePath, ref) {
  const res = await fetch(contentsUrl(repo, filePath, ref), { headers })
  const body = await readBody(res)
  if (!body.ok || !body.json || !body.json.content) {
    throw new Error(ghError(body, `File not found: ${filePath} in ${repo}`))
  }
  return body.json
}

async function writeRepoFile(repo, headers, filePath, content, message, sha, branch) {
  const payload = {
    message: message || 'Update file via Neocryptz AI',
    content: base64Encode(content)
  }
  if (sha) payload.sha = sha
  if (branch) payload.branch = branch

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  })
  const body = await readBody(res)
  if (!body.ok || !body.json || !body.json.commit) {
    throw new Error(ghError(body, 'GitHub push failed.'))
  }
  return body.json
}

export async function onRequestPost(context) {
  const request = context.request
  const env = context.env

  const executeSecret = request.headers.get('x-execute-secret')
  if (!executeSecret || executeSecret !== env.EXECUTE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = env.GH_TOKEN
  if (!token) return Response.json({ error: 'GitHub token not configured on server.' }, { status: 500 })

  let requestBody
  try {
    requestBody = await request.json()
  } catch (e) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    action,
    repo,
    path,
    inject,
    position,
    content,
    message,
    find,
    replace,
    url,
    branch,
    ref,
    base_branch,
    base_sha,
    title,
    head,
    base,
    body: prBody,
    draft,
    state,
    sort,
    direction,
    per_page,
    page,
    protected: protectedOnly
  } = requestBody || {}

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Neocryptz-AI'
  }

  try {
    if (action === 'list_repos') {
      const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=pushed', { headers: ghHeaders })
      const body = await readBody(res)
      if (!body.ok || !Array.isArray(body.json)) return Response.json({ error: ghError(body, 'Could not list repos.') }, { status: 500 })
      const repos = body.json.map(rp => ({ name: rp.name, full_name: rp.full_name, pushed_at: rp.pushed_at && rp.pushed_at.slice(0, 10) }))
      return Response.json({ repos })
    }

    if (action === 'read_file_excerpt') {
      if (!repo || !path) return Response.json({ error: 'Missing repo or path.' }, { status: 400 })
      const readRef = ref || branch || null
      const file = await readRepoFile(repo, ghHeaders, path, readRef)
      const full = base64Decode(file.content)
      const excerpt = full.length > 6000
        ? full.slice(0, 3000) + '\n\n...[TRUNCATED — file is ' + full.length + ' chars]...\n\n' + full.slice(-1500)
        : full
      return Response.json({ excerpt, sha: file.sha, size: full.length, ref: readRef })
    }

    if (action === 'list_branches') {
      if (!repo) return Response.json({ error: 'Missing repo.' }, { status: 400 })
      const branches = await listBranches(repo, ghHeaders, protectedOnly, per_page, page)
      return Response.json({ branches })
    }

    if (action === 'list_pull_requests') {
      if (!repo) return Response.json({ error: 'Missing repo.' }, { status: 400 })
      const pull_requests = await listPullRequests(repo, ghHeaders, state, head, base, sort, direction, per_page, page)
      return Response.json({ pull_requests })
    }

    if (action === 'create_branch') {
      if (!repo || !branch) return Response.json({ error: 'Missing repo or branch.' }, { status: 400 })
      const branchInfo = await createBranch(repo, ghHeaders, branch, base_branch, base_sha)
      return Response.json({ success: true, ...branchInfo })
    }

    if (action === 'create_pull_request') {
      if (!repo || !title || !head || !base) {
        return Response.json({ error: 'Missing repo, title, head, or base.' }, { status: 400 })
      }
      const pr = await createPullRequest(repo, ghHeaders, title, head, base, prBody, draft)
      return Response.json({ success: true, ...pr })
    }

    if (action === 'inject_html') {
      if (!repo || !path || !inject) return Response.json({ error: 'Missing repo, path, or inject content.' }, { status: 400 })

      const readRef = ref || branch || null
      const file = await readRepoFile(repo, ghHeaders, path, readRef)
      let fileText = base64Decode(file.content)
      const pos = position || 'before_closing_body'
      const writeBranch = branch || null

      if (pos === 'before_closing_body') {
        if (!fileText.includes('</body>')) return Response.json({ error: 'No </body> tag found in file.' }, { status: 400 })
        fileText = fileText.replace('</body>', inject + '\n</body>')
      } else if (pos === 'before_closing_head') {
        if (!fileText.includes('</head>')) return Response.json({ error: 'No </head> tag found in file.' }, { status: 400 })
        fileText = fileText.replace('</head>', inject + '\n</head>')
      } else if (pos === 'after_opening_body') {
        fileText = fileText.replace(/<body([^>]*)>/, m => m + '\n' + inject)
      } else {
        return Response.json({ error: 'Unknown position: ' + pos }, { status: 400 })
      }

      const pushData = await writeRepoFile(
        repo,
        ghHeaders,
        path,
        fileText,
        message || 'Inject HTML via Neocryptz AI',
        file.sha,
        writeBranch
      )

      return Response.json({
        success: true,
        commit: pushData.commit.sha,
        repo,
        path,
        branch: writeBranch,
        message: `✅ Pushed to ${repo}/${path} — Cloudflare will redeploy in ~30 seconds.`
      })
    }

    if (action === 'patch_file') {
      if (!repo || !path || !find) return Response.json({ error: 'Missing repo, path, or find string.' }, { status: 400 })

      const readRef = ref || branch || null
      const file = await readRepoFile(repo, ghHeaders, path, readRef)
      let fileText = base64Decode(file.content)
      if (!fileText.includes(find)) return Response.json({ error: 'Search string not found in file.' }, { status: 400 })
      fileText = fileText.replace(find, replace || '')

      const pushData = await writeRepoFile(
        repo,
        ghHeaders,
        path,
        fileText,
        message || 'Patch file via Neocryptz AI',
        file.sha,
        branch || null
      )

      return Response.json({
        success: true,
        commit: pushData.commit.sha,
        branch: branch || null,
        message: `✅ Patched ${repo}/${path} — Cloudflare will redeploy in ~30 seconds.`
      })
    }

    if (action === 'push_file') {
      if (!repo || !path || content === undefined) return Response.json({ error: 'Missing repo, path, or content.' }, { status: 400 })

      let sha
      const readRef = ref || branch || null
      try {
        const currentFile = await readRepoFile(repo, ghHeaders, path, readRef)
        sha = currentFile.sha
      } catch (e) {
        sha = undefined
      }

      const pushData = await writeRepoFile(
        repo,
        ghHeaders,
        path,
        content,
        message || 'Update file via Neocryptz AI',
        sha,
        branch || null
      )

      return Response.json({
        success: true,
        commit: pushData.commit.sha,
        branch: branch || null,
        message: `✅ Pushed ${path} to ${repo} — Cloudflare will redeploy in ~30 seconds.`
      })
    }

    if (action === 'redeploy') {
      const cfToken = env.CF_API_TOKEN
      if (!cfToken) return Response.json({ error: 'CF_API_TOKEN not configured on server.' }, { status: 500 })
      const deployRes = await fetch('https://api.cloudflare.com/client/v4/accounts/35078329dfee4f3908f4b41ccde638a9/pages/projects/meow/deployments', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfToken}` }
      })
      const deployData = await deployRes.json()
      if (deployData.success) {
        return Response.json({ success: true, deployment_id: deployData.result && deployData.result.id, message: '✅ Redeploy triggered — Cloudflare is building the latest commit now.' })
      }
      return Response.json({ error: (deployData.errors && deployData.errors[0] && deployData.errors[0].message) || 'Cloudflare redeploy failed.' }, { status: 500 })
    }

    if (action === 'browse_page') {
      const cfToken = env.CF_API_TOKEN
      if (!cfToken) return Response.json({ error: 'CF_API_TOKEN not configured on server.' }, { status: 500 })
      if (!url) return Response.json({ error: 'Missing url.' }, { status: 400 })
      const browseRes = await fetch('https://api.cloudflare.com/client/v4/accounts/35078329dfee4f3908f4b41ccde638a9/browser-rendering/markdown', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const browseData = await browseRes.json()
      if (browseData.success !== false && browseData.result) {
        return Response.json({ success: true, action: 'browse_page', url, content: String(browseData.result).slice(0, 8000), message: `Read ${url}` })
      }
      return Response.json({ error: (browseData.errors && browseData.errors[0] && browseData.errors[0].message) || 'Failed to browse page.' }, { status: 500 })
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 })
  } catch (err) {
    return Response.json({ error: 'Execution error: ' + err.message }, { status: 500 })
  }
}
