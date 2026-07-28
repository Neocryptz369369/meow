// Cloudflare Pages Function: server-side URL fetcher for the System Data Scraper.
// Runs on Cloudflare's edge (no browser CORS, no dependence on flaky public proxies).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    let target = (body && body.url ? String(body.url) : '').trim();
    if (!target) {
      return json({ error: 'Missing url' }, 400);
    }
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    let hostname;
    try { hostname = new URL(target).hostname; } catch (e) {
      return json({ error: 'Invalid url' }, 400);
    }
    // Block private / internal hosts (SSRF protection).
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/i.test(hostname) || hostname.endsWith('.internal')) {
      return json({ error: 'Blocked host' }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let resp;
    try {
      resp = await fetch(target, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NeocryptzScraper/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      return json({ error: 'Fetch failed: HTTP ' + resp.status }, 502);
    }

    const html = await resp.text();
    const text = htmlToText(html).slice(0, 8000);
    return json({ url: target, text: text, length: text.length });
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? 'Request timed out' : ('Error: ' + (e && e.message));
    return json({ error: msg }, 500);
  }
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
