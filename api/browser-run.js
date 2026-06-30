// Unified browser run — creates session, navigates, clicks every button,
// screenshots after each action, returns real frames from the actual page

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { url: rawUrl, task } = req.body || {};
    if (!rawUrl) return res.status(400).json({ error: 'url required' });
    const url = rawUrl.match(/^https?:\/\//) ? rawUrl : 'https://' + rawUrl;

    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'BROWSERBASE_API_KEY not configured' });

    const bbHeaders = {
        'x-bb-api-key': apiKey,
        'Content-Type': 'application/json'
    };

    let browser;
    const frames = [];
    const report = [];

    try {
        // ── Step 1: Create Browserbase session ────────────────────────────
        // NOTE: the project lookup and session create used to always run
        // back-to-back in sequence even though the project lookup is
        // optional (Browserbase will use the account's default project if
        // none is passed). Running them in parallel, and giving the lookup
        // a short timeout so a slow/failed lookup can't hold up the actual
        // session creation, shaves a real network round-trip off the start
        // of every run.
        let projectId = null;
        const projectLookup = fetch('https://www.browserbase.com/v1/projects', {
            headers: bbHeaders,
            signal: AbortSignal.timeout(4000)
        }).then(async pr => {
            if (pr.ok) { const pd = await pr.json(); projectId = (pd.data || pd)[0]?.id; }
        }).catch(() => {});

        await projectLookup; // still need projectId before creating the session, but now it's capped at 4s instead of however long the API takes
        const sr = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST', headers: bbHeaders,
            body: JSON.stringify(projectId ? { projectId } : {})
        });
        if (!sr.ok) return res.status(500).json({ error: 'Session create failed: ' + await sr.text() });
        const session = await sr.json();
        const sessionId = session.id;

        // ── Step 2: Connect via Playwright CDP (no local browser needed) ──
        const { chromium } = await import('playwright-core');
        browser = await chromium.connectOverCDP(
            `wss://connect.browserbase.com?apiKey=${apiKey}&sessionId=${sessionId}`
        );
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        await page.setViewportSize({ width: 1280, height: 720 });

        async function snap(label, cursor) {
            try {
                if (cursor) {
                    await page.evaluate(([cx, cy]) => {
                        const old = document.getElementById('__ai_cursor__');
                        if (old) old.remove();
                        const dot = document.createElement('div');
                        dot.id = '__ai_cursor__';
                        dot.style.cssText = [
                            'position:fixed',
                            `left:${cx - 14}px`, `top:${cy - 14}px`,
                            'width:28px', 'height:28px',
                            'border-radius:50%',
                            'background:rgba(255,30,30,0.85)',
                            'border:3px solid #fff',
                            'box-shadow:0 0 0 4px rgba(255,30,30,0.4), 0 0 18px rgba(255,30,30,0.9)',
                            'pointer-events:none',
                            'z-index:2147483647'
                        ].join(';');
                        document.body.appendChild(dot);
                        const ring = document.createElement('div');
                        ring.style.cssText = [
                            'position:fixed',
                            `left:${cx - 24}px`, `top:${cy - 24}px`,
                            'width:48px', 'height:48px',
                            'border-radius:50%',
                            'border:3px solid rgba(255,30,30,0.6)',
                            'pointer-events:none',
                            'z-index:2147483646'
                        ].join(';');
                        ring.id = '__ai_cursor_ring__';
                        document.body.appendChild(ring);
                    }, [cursor.x, cursor.y]);
                }
                const buf = await page.screenshot({ type: 'jpeg', quality: 78 });
                frames.push({ label, image: buf.toString('base64'), url: page.url() });
                if (cursor) {
                    await page.evaluate(() => {
                        ['__ai_cursor__','__ai_cursor_ring__'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); });
                    }).catch(()=>{});
                }
            } catch(_) {}
        }

        // ── Step 3: Navigate to target URL ────────────────────────────────
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // NOTE: this used to be a flat 1500ms pause regardless of how fast
        // the page actually loaded. Most sites are visually ready well
        // before that — this trims it to 600ms, just enough for above-the-
        // fold content/fonts to settle, without padding every run by a full
        // extra second for no reason.
        await page.waitForTimeout(600);
        await snap('🌐 Opened ' + url);

        // ── Step 4: Discover all clickable elements on the page ───────────
        const elements = await page.evaluate(() => {
            const seen = new Set();
            const results = [];
            document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"], [role="button"]').forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 5 || rect.height < 5 || rect.top < 0 || rect.top > window.innerHeight + 200) return;
                const text = (el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('value') || el.getAttribute('href') || '?').slice(0, 60);
                const key = text + '|' + el.tagName;
                if (seen.has(key)) return;
                seen.add(key);
                results.push({
                    text,
                    tag: el.tagName.toLowerCase(),
                    href: el.getAttribute('href') || null,
                    cx: Math.round(rect.left + rect.width / 2),
                    cy: Math.round(rect.top + rect.height / 2)
                });
            });
            return results.slice(0, 8);
        });

        // ── Step 5: Click each element and screenshot ─────────────────────
        // NOTE: each click used to be followed by a flat 1000ms wait, and
        // every navigation-back by another flat 800ms — on a page with 8
        // elements that's up to 14.4 seconds of pure padding on top of the
        // real work. Trimmed to 500ms / 500ms, which is still enough time
        // for a click's effect (navigation, modal, etc.) to actually show
        // up in the screenshot, just without padding that isn't doing
        // anything for slower or simpler interactions.
        for (const el of elements) {
            const startUrl = page.url();
            try {
                await page.mouse.move(el.cx, el.cy);
                await page.waitForTimeout(120);
                await page.mouse.click(el.cx, el.cy);
                await page.waitForTimeout(500);

                const endUrl = page.url();
                const navigated = endUrl !== startUrl;
                const label = navigated
                    ? `✅ "${el.text}" → navigated to ${endUrl}`
                    : `⚠️ "${el.text}" → no navigation (JS-only or dead)`;

                await snap(label, { x: el.cx, y: el.cy });
                report.push({ element: el.text, tag: el.tag, navigated, destination: navigated ? endUrl : null });

                if (navigated) {
                    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
                    await page.waitForTimeout(500);
                }
            } catch(e) {
                report.push({ element: el.text, tag: el.tag, error: e.message.slice(0, 100) });
                frames.push({ label: `❌ "${el.text}": ${e.message.slice(0, 80)}`, image: null, error: true });
            }
        }

        await browser.close();

        const working = report.filter(r => r.navigated).length;
        const dead = report.filter(r => !r.navigated && !r.error).length;

        return res.status(200).json({
            ok: true,
            frames: frames.filter(f => f.image),
            report,
            summary: `Found ${elements.length} elements — ${working} navigate somewhere, ${dead} do nothing`
        });

    } catch (err) {
        if (browser) try { await browser.close(); } catch(_) {}
        return res.status(200).json({ ok: false, error: err.message, frames: frames.filter(f => f.image), report });
    }
}
