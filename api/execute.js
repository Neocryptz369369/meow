module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'GitHub token not configured on server.' });

    const { action, repo, path, inject, position, content, message } = req.body || {};

    const ghHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    };

    try {
        // ── list_repos ──────────────────────────────────────────────────────
        if (action === 'list_repos') {
            const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=pushed', { headers: ghHeaders });
            const data = await r.json();
            if (!Array.isArray(data)) return res.status(500).json({ error: data.message || 'Could not list repos.' });
            const repos = data.map(rp => ({ name: rp.name, full_name: rp.full_name, pushed_at: rp.pushed_at?.slice(0, 10) }));
            return res.status(200).json({ repos });
        }

        // ── read_file_excerpt ────────────────────────────────────────────────
        if (action === 'read_file_excerpt') {
            if (!repo || !path) return res.status(400).json({ error: 'Missing repo or path.' });
            const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
            const data = await r.json();
            if (!data.content) return res.status(404).json({ error: `File not found: ${path} in ${repo}` });
            const full = Buffer.from(data.content, 'base64').toString('utf8');
            const excerpt = full.length > 6000
                ? full.slice(0, 3000) + '\n\n...[TRUNCATED — file is ' + full.length + ' chars]...\n\n' + full.slice(-1500)
                : full;
            return res.status(200).json({ excerpt, sha: data.sha, size: full.length });
        }

        // ── inject_html ──────────────────────────────────────────────────────
        // Reads the current file from GitHub, injects content at the specified
        // position, then pushes the modified file back.
        if (action === 'inject_html') {
            if (!repo || !path || !inject) return res.status(400).json({ error: 'Missing repo, path, or inject content.' });

            const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
            const data = await r.json();
            if (!data.content) return res.status(404).json({ error: `File not found: ${path} in ${repo}` });

            let fileText = Buffer.from(data.content, 'base64').toString('utf8');
            const sha = data.sha;
            const pos = position || 'before_closing_body';

            if (pos === 'before_closing_body') {
                if (!fileText.includes('</body>')) return res.status(400).json({ error: 'No </body> tag found in file.' });
                fileText = fileText.replace('</body>', inject + '\n</body>');
            } else if (pos === 'before_closing_head') {
                if (!fileText.includes('</head>')) return res.status(400).json({ error: 'No </head> tag found in file.' });
                fileText = fileText.replace('</head>', inject + '\n</head>');
            } else if (pos === 'after_opening_body') {
                fileText = fileText.replace(/<body([^>]*)>/, (m) => m + '\n' + inject);
            } else {
                return res.status(400).json({ error: 'Unknown position: ' + pos });
            }

            const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: ghHeaders,
                body: JSON.stringify({
                    message: message || 'Inject HTML via Neocryptz AI',
                    content: Buffer.from(fileText).toString('base64'),
                    sha
                })
            });
            const pushData = await pushRes.json();
            if (pushData.commit) {
                return res.status(200).json({
                    success: true,
                    commit: pushData.commit.sha,
                    repo,
                    path,
                    message: `✅ Pushed to ${repo}/${path} — Vercel will redeploy in ~30 seconds.`
                });
            }
            return res.status(500).json({ error: pushData.message || 'GitHub push failed.' });
        }

        // ── patch_file ───────────────────────────────────────────────────────
        // Finds an exact string in the file and replaces it with another.
        if (action === 'patch_file') {
            const { find, replace } = req.body || {};
            if (!repo || !path || !find) return res.status(400).json({ error: 'Missing repo, path, or find string.' });

            const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
            const data = await r.json();
            if (!data.content) return res.status(404).json({ error: `File not found: ${path} in ${repo}` });

            let fileText = Buffer.from(data.content, 'base64').toString('utf8');
            if (!fileText.includes(find)) return res.status(400).json({ error: 'Search string not found in file.' });

            fileText = fileText.replace(find, replace || '');

            const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: ghHeaders,
                body: JSON.stringify({
                    message: message || 'Patch file via Neocryptz AI',
                    content: Buffer.from(fileText).toString('base64'),
                    sha: data.sha
                })
            });
            const pushData = await pushRes.json();
            if (pushData.commit) {
                return res.status(200).json({
                    success: true,
                    commit: pushData.commit.sha,
                    message: `✅ Patched ${repo}/${path} — Vercel will redeploy in ~30 seconds.`
                });
            }
            return res.status(500).json({ error: pushData.message || 'GitHub push failed.' });
        }

        // ── push_file ────────────────────────────────────────────────────────
        // Replaces entire file content (use only for small/new files).
        if (action === 'push_file') {
            if (!repo || !path || content === undefined) return res.status(400).json({ error: 'Missing repo, path, or content.' });

            let sha;
            try {
                const shaRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: ghHeaders });
                const shaData = await shaRes.json();
                sha = shaData.sha;
            } catch (_) {}

            const body = {
                message: message || 'Update file via Neocryptz AI',
                content: Buffer.from(content).toString('base64')
            };
            if (sha) body.sha = sha;

            const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: ghHeaders,
                body: JSON.stringify(body)
            });
            const pushData = await pushRes.json();
            if (pushData.commit) {
                return res.status(200).json({
                    success: true,
                    commit: pushData.commit.sha,
                    message: `✅ Pushed ${path} to ${repo} — Vercel will redeploy in ~30 seconds.`
                });
            }
            return res.status(500).json({ error: pushData.message || 'GitHub push failed.' });
        }

        return res.status(400).json({ error: 'Unknown action: ' + action });

    } catch (err) {
        return res.status(500).json({ error: 'Execution error: ' + err.message });
    }
}
