// Browser API — uses thum.io for real screenshots (free, no API key)
// + fetch for HTML parsing and link health checks

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { url, actions = [] } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });

    const frames = [];
    const baseUrl = new URL(url);

    async function snap(pageUrl, label) {
        try {
            const thumbUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(pageUrl)}`;
            const r = await fetch(thumbUrl, { signal: AbortSignal.timeout(12000) });
            if (r.ok && r.headers.get('content-type')?.startsWith('image/')) {
                const buf = await r.arrayBuffer();
                frames.push({ label, image: Buffer.from(buf).toString('base64'), url: pageUrl });
                return true;
            }
        } catch (e) {}
        frames.push({ label: `⚠️ ${label} — screenshot failed`, image: null, error: true });
        return false;
    }

    function resolve(href) {
        try {
            if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto') || href.startsWith('tel')) return null;
            return new URL(href, baseUrl.origin).href;
        } catch { return null; }
    }

    try {
        await snap(url, `🌐 Opened ${baseUrl.hostname}`);

        let links = [];
        let buttonLabels = [];
        try {
            const htmlRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(10000)
            });
            const html = await htmlRes.text();

            const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
            for (const m of linkMatches) {
                const href = resolve(m[1]);
                const label = m[2].replace(/<[^>]+>/g, '').trim().slice(0, 60) || m[1];
                if (href) links.push({ href, label });
            }

            const btnMatches = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)];
            for (const b of btnMatches) {
                const lbl = b[1].replace(/<[^>]+>/g, '').trim().slice(0, 60);
                if (lbl) buttonLabels.push(lbl);
            }

            const seen = new Set();
            links = links.filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; });

        } catch (e) {
            frames.push({ label: `⚠️ Could not fetch page HTML: ${e.message}`, image: null, error: true });
        }

        for (const action of actions) {
            if (action.type === 'screenshot') {
                await snap(url, action.label || 'Snapshot');
            } else if (action.type === 'navigate' && action.url) {
                const target = resolve(action.url) || action.url;
                await snap(target, action.label || `Navigated to ${target}`);
            }
        }

        const toVisit = links.slice(0, 8);
        for (const { href, label } of toVisit) {
            let status = '?';
            try {
                const hr = await fetch(href, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
                status = hr.ok ? '✅' : `❌ ${hr.status}`;
            } catch { status = '❌ unreachable'; }

            await snap(href, `${status} "${label}"`);
        }

        if (buttonLabels.length > 0) {
            frames.push({
                label: `ℹ️ Buttons found (JS-only — need real browser to click): ${buttonLabels.join(', ')}`,
                image: null,
                info: true
            });
        }

        return res.status(200).json({
            ok: true,
            frames: frames.filter(f => f.image),
            notes: frames.filter(f => !f.image)
        });

    } catch (err) {
        return res.status(200).json({
            ok: false,
            error: err.message,
            frames: frames.filter(f => f.image),
            notes: frames.filter(f => !f.image)
        });
    }
}
