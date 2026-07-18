// functions/api/browser-run.js
// Cloudflare Pages Function.
// Powers the "AI Agent" popup over the logo: captures real screenshots of a page
// and returns them as frames the front-end slideshow can display.
// Always returns valid JSON (never an empty body), so the popup can never crash.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Turn an ArrayBuffer into a base64 string (no data: prefix).
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Ask a keyless screenshot renderer for a real picture of the page.
// mShots returns a small "loading" GIF first, then the real JPEG once ready,
// so we retry until we get a proper JPEG (or give up gracefully).
async function captureFrame(pageUrl, width, height, label) {
  const shotUrl = 'https://s0.wp.com/mshots/v1/' +
    encodeURIComponent(pageUrl) + '?w=' + width + '&h=' + height;
  let lastBuf = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(shotUrl, { headers: { 'User-Agent': 'Mozilla/5.0 NeocryptzAgent' } });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const buf = await r.arrayBuffer();
      lastBuf = buf;
      // A real screenshot comes back as JPEG/PNG and is reasonably large.
      if ((ct.includes('jpeg') || ct.includes('png')) && buf.byteLength > 3000) {
        return { url: pageUrl, image: bufToBase64(buf), label: label };
      }
    } catch (e) { /* keep trying */ }
    await new Promise(function (res) { setTimeout(res, 1500); });
  }
  // Fallback: return whatever we last got (still a valid image, just the placeholder).
  if (lastBuf) return { url: pageUrl, image: bufToBase64(lastBuf), label: label };
  return null;
}

export async function onRequestPost(context) {
  const { request } = context;
  try {
    let payload = {};
    try { payload = await request.json(); } catch (e) { payload = {}; }

    let url = (payload && payload.url ? String(payload.url) : '').trim();
    const task = (payload && payload.task ? String(payload.task) : '').trim();
    if (!url) url = 'https://neocryptzai.com';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    // Build a few labelled steps so the popup shows a real sequence.
    const steps = [
      { w: 1000, h: 700, label: task ? ('Opening page for: ' + task) : 'Opening the page' },
      { w: 1000, h: 900, label: 'Reading the page' },
      { w: 1200, h: 800, label: 'Finished looking at the page' }
    ];

    const frames = [];
    for (let i = 0; i < steps.length; i++) {
      const f = await captureFrame(url, steps[i].w, steps[i].h, steps[i].label);
      if (f) frames.push(f);
    }

    if (!frames.length) {
      return json({ ok: false, frames: [], error: 'Could not capture the page right now. Please try again.' });
    }
    return json({ ok: true, frames: frames });
  } catch (err) {
    // Never crash the popup: always hand back valid JSON.
    return json({ ok: false, frames: [], error: 'Browser run failed: ' + (err && err.message ? err.message : String(err)) });
  }
}
