// Browser API — uses thum.io for real screenshots (free, no API key)
// + fetch for HTML parsing and link health checks

export async function onRequestPost(context) {
    const request = context.request;

  let body;
    try {
          body = await request.json();
    } catch (e) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

  const { url, actions = [] } = body || {};
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  const frames = [];
    const baseUrl = new URL(url);

  // Cloudflare Workers have no Buffer — convert ArrayBuffer to base64 manually
  function arrayBufferToBase64(buf) {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
  }

  async function snap(pageUrl, label) {
        try {
                const thumbUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(pageUrl)}`;
                const r = await fetch(thumbUrl, { signal: AbortSignal.timeout(12000) });
                if (r.ok && r.headers.get('content-type')?.startsWith('image/')) {
                          const buf = await r.arrayBuffer();
                          frames.push({ label, image: arrayBufferToBase64(buf), url: pageUrl });
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

      return Response.json({
              ok: true,
              frames: frames.filter(f => f.image),
              notes: frames.filter(f => !f.image)
      });

  } catch (err) {
        return Response.json({
                ok: false,
                error: err.message,
                frames: frames.filter(f => f.image),
                notes: frames.filter(f => !f.image)
        });
  }
}
