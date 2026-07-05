// Browser Run - uses Browserless.io /function REST API
// Sends a complete Puppeteer script in one REST call - no WebSocket, no Playwright install needed

export async function onRequestPost(context) {
      const request = context.request;
      const env = context.env;

  const apiKey = env.BROWSERLESS_API_KEY;
      if (!apiKey) return Response.json({ error: 'BROWSERLESS_API_KEY not configured' }, { status: 500 });

  let body;
      try {
              body = await request.json();
      } catch (e) {
              return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

  const { url: rawUrl, task } = body || {};
      if (!rawUrl) return Response.json({ error: 'url required' }, { status: 400 });
      const url = rawUrl.match(/^https?:\/\//) ? rawUrl : 'https://' + rawUrl;

  const puppeteerScript = `
  export default async ({ page }) => {
    const frames = [];
      const report = [];

        async function snap(label, pageUrl) {
            try {
                  const buf = await page.screenshot({ type: 'jpeg', quality: 75 });
                        const base64 = buf.toString('base64');
                              frames.push({ label, image: base64, url: pageUrl || page.url() });
                                  } catch(e) {}
                                    }

                                      async function showCursor(x, y) {
                                          await page.evaluate((cx, cy) => {
                                                ['__ai_cursor__','__ai_cursor_ring__'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); });
                                                      const dot = document.createElement('div');
                                                            dot.id = '__ai_cursor__';
                                                                  dot.style.cssText = 'position:fixed;left:'+(cx-14)+'px;top:'+(cy-14)+'px;width:28px;height:28px;border-radius:50%;background:rgba(255,30,30,0.85);border:3px solid #fff;box-shadow:0 0 0 4px rgba(255,30,30,0.4),0 0 18px rgba(255,30,30,0.9);pointer-events:none;z-index:2147483647';
                                                                        document.body.appendChild(dot);
                                                                              const ring = document.createElement('div');
                                                                                    ring.id = '__ai_cursor_ring__';
                                                                                          ring.style.cssText = 'position:fixed;left:'+(cx-24)+'px;top:'+(cy-24)+'px;width:48px;height:48px;border-radius:50%;border:3px solid rgba(255,30,30,0.6);pointer-events:none;z-index:2147483646';
                                                                                                document.body.appendChild(ring);
                                                                                                    }, x, y).catch(()=>{});
                                                                                                      }
                                                                                                      
                                                                                                        async function hideCursor() {
                                                                                                            await page.evaluate(() => {
                                                                                                                  ['__ai_cursor__','__ai_cursor_ring__'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); });
                                                                                                                      }).catch(()=>{});
                                                                                                                        }
                                                                                                                        
                                                                                                                          await page.setViewport({ width: 1280, height: 720 });
                                                                                                                            await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 20000 });
                                                                                                                              await new Promise(r => setTimeout(r, 1000));
                                                                                                                                await snap('Opened ' + ${JSON.stringify(url)});
                                                                                                                                
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
                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                  for (const el of elements) {
                                                                                                                                                                                                                                                      const startUrl = page.url();
                                                                                                                                                                                                                                                          try {
                                                                                                                                                                                                                                                                await page.mouse.move(el.cx, el.cy);
                                                                                                                                                                                                                                                                      await showCursor(el.cx, el.cy);
                                                                                                                                                                                                                                                                            await new Promise(r => setTimeout(r, 200));
                                                                                                                                                                                                                                                                                  await snap('Clicking "' + el.text + '"...', startUrl);
                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                        await page.mouse.click(el.cx, el.cy);
                                                                                                                                                                                                                                                                                              await new Promise(r => setTimeout(r, 800));
                                                                                                                                                                                                                                                                                                    await hideCursor();
                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                          const endUrl = page.url();
                                                                                                                                                                                                                                                                                                                const navigated = endUrl !== startUrl;
                                                                                                                                                                                                                                                                                                                      const label = navigated
                                                                                                                                                                                                                                                                                                                              ? '"' + el.text + '" navigated to ' + endUrl
                                                                                                                                                                                                                                                                                                                                      : '"' + el.text + '" clicked (JS action)';
                                                                                                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                                                                                            await snap(label, endUrl);
                                                                                                                                                                                                                                                                                                                                                  report.push({ element: el.text, tag: el.tag, navigated, destination: navigated ? endUrl : null });
                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                        if (navigated) {
                                                                                                                                                                                                                                                                                                                                                                await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(()=>{});
                                                                                                                                                                                                                                                                                                                                                                        await new Promise(r => setTimeout(r, 500));
                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                  } catch(e) {
                                                                                                                                                                                                                                                                                                                                                                                        report.push({ element: el.text, tag: el.tag, error: e.message.slice(0, 100) });
                                                                                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                                                                                                                const working = report.filter(r => r.navigated).length;
                                                                                                                                                                                                                                                                                                                                                                                                  return {
                                                                                                                                                                                                                                                                                                                                                                                                      data: {
                                                                                                                                                                                                                                                                                                                                                                                                            ok: true,
                                                                                                                                                                                                                                                                                                                                                                                                                  frames,
                                                                                                                                                                                                                                                                                                                                                                                                                        report,
                                                                                                                                                                                                                                                                                                                                                                                                                              summary: 'Found ' + elements.length + ' elements - ' + working + ' navigate somewhere'
                                                                                                                                                                                                                                                                                                                                                                                                                                  },
                                                                                                                                                                                                                                                                                                                                                                                                                                      type: 'application/json'
                                                                                                                                                                                                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                                                                                                                                                                                                        `;

  try {
          const res = await fetch(
                    `https://production-sfo.browserless.io/function?token=${apiKey}`,
              {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/javascript' },
                          body: puppeteerScript
              }
                  );

        if (!res.ok) {
                  const err = await res.text();
                  return Response.json({ ok: false, error: 'Browserless error: ' + err }, { status: 500 });
        }

        const result = await res.json();
          return Response.json(result);

  } catch (err) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
