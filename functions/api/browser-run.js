// Browser Run — uses Steel.dev REST API for real browser automation
// Real cursor movement, clicks, screenshots — no Playwright, no Node libs needed

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

  const apiKey = env.STEEL_API_KEY;
    if (!apiKey) return Response.json({ error: 'STEEL_API_KEY not configured' }, { status: 500 });

  let body;
    try {
          body = await request.json();
    } catch (e) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

  const { url: rawUrl, task } = body || {};
    if (!rawUrl) return Response.json({ error: 'url required' }, { status: 400 });
    const url = rawUrl.match(/^https?:\/\//) ? rawUrl : 'https://' + rawUrl;

  const steelHeaders = {
        'Steel-Api-Key': apiKey,
        'Content-Type': 'application/json'
  };

  const frames = [];
    const report = [];
    let sessionId = null;

  try {
        // Step 1: Create Steel session
      const sessionRes = await fetch('https://api.steel.dev/v1/sessions', {
              method: 'POST',
              headers: steelHeaders,
              body: JSON.stringify({ use_proxy: false, solve_captcha: false })
      });
        if (!sessionRes.ok) {
                const err = await sessionRes.text();
                return Response.json({ error: 'Steel session creation failed: ' + err }, { status: 500 });
        }
        const session = await sessionRes.json();
        sessionId = session.id;

      // Step 2: Navigate to target URL
      const navRes = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/navigate`, {
              method: 'POST',
              headers: steelHeaders,
              body: JSON.stringify({ url, wait_until: 'domcontentloaded' })
      });
        if (!navRes.ok) throw new Error('Navigation failed: ' + await navRes.text());

      // Wait for page to settle
      await new Promise(r => setTimeout(r, 1500));

      // Step 3: Screenshot after load
      const snap1 = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/screenshot`, {
              method: 'POST',
              headers: steelHeaders
      });
        if (snap1.ok) {
                const snapData = await snap1.json();
                if (snapData.screenshot) {
                          frames.push({ label: `🌐 Opened ${url}`, image: snapData.screenshot, url });
                }
        }

      // Step 4: Get all clickable elements
      const elemsRes = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/evaluate`, {
              method: 'POST',
              headers: steelHeaders,
              body: JSON.stringify({
                        expression: `
                                  (function() {
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
                                                                                                                                                                                                                                                                                                        })()
                                                                                                                                                                                                                                                                                                                `
              })
      });

      let elements = [];
        if (elemsRes.ok) {
                const elemsData = await elemsRes.json();
                elements = elemsData.result || [];
        }

      // Step 5: Click each element with cursor animation and screenshot
      for (const el of elements) {
              try {
                        // Move mouse to element (shows cursor)
                await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/move`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({ x: el.cx, y: el.cy })
                });
                        await new Promise(r => setTimeout(r, 200));

                // Inject visual cursor
                await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/evaluate`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({
                                          expression: `
                                                        (function(cx, cy) {
                                                                        ['__ai_cursor__','__ai_cursor_ring__'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); });
                                                                                        const dot = document.createElement('div');
                                                                                                        dot.id = '__ai_cursor__';
                                                                                                                        dot.style.cssText = 'position:fixed;left:'+(cx-14)+'px;top:'+(cy-14)+'px;width:28px;height:28px;border-radius:50%;background:rgba(255,30,30,0.85);border:3px solid #fff;box-shadow:0 0 0 4px rgba(255,30,30,0.4),0 0 18px rgba(255,30,30,0.9);pointer-events:none;z-index:2147483647';
                                                                                                                                        document.body.appendChild(dot);
                                                                                                                                                        const ring = document.createElement('div');
                                                                                                                                                                        ring.id = '__ai_cursor_ring__';
                                                                                                                                                                                        ring.style.cssText = 'position:fixed;left:'+(cx-24)+'px;top:'+(cy-24)+'px;width:48px;height:48px;border-radius:50%;border:3px solid rgba(255,30,30,0.6);pointer-events:none;z-index:2147483646';
                                                                                                                                                                                                        document.body.appendChild(ring);
                                                                                                                                                                                                                      })(${el.cx}, ${el.cy})
                                                                                                                                                                                                                                  `
                            })
                });

                // Get URL before click
                const beforeUrlRes = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/evaluate`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({ expression: 'window.location.href' })
                });
                        const beforeUrlData = beforeUrlRes.ok ? await beforeUrlRes.json() : {};
                        const startUrl = beforeUrlData.result || url;

                // Screenshot with cursor visible
                const presnap = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/screenshot`, {
                            method: 'POST',
                            headers: steelHeaders
                });
                        if (presnap.ok) {
                                    const presnapData = await presnap.json();
                                    if (presnapData.screenshot) {
                                                  frames.push({ label: `🖱️ Clicking "${el.text}"...`, image: presnapData.screenshot, url: startUrl });
                                    }
                        }

                // Click
                await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/click`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({ x: el.cx, y: el.cy })
                });
                        await new Promise(r => setTimeout(r, 800));

                // Remove cursor
                await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/evaluate`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({
                                          expression: `['__ai_cursor__','__ai_cursor_ring__'].forEach(id => { const e = document.getElementById(id); if(e) e.remove(); })`
                            })
                });

                // Get URL after click
                const afterUrlRes = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/evaluate`, {
                            method: 'POST',
                            headers: steelHeaders,
                            body: JSON.stringify({ expression: 'window.location.href' })
                });
                        const afterUrlData = afterUrlRes.ok ? await afterUrlRes.json() : {};
                        const endUrl = afterUrlData.result || startUrl;
                        const navigated = endUrl !== startUrl;

                const label = navigated
                          ? `✅ "${el.text}" → navigated to ${endUrl}`
                            : `⚠️ "${el.text}" → clicked (JS action or no navigation)`;

                // Screenshot after click
                const postsnap = await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/screenshot`, {
                            method: 'POST',
                            headers: steelHeaders
                });
                        if (postsnap.ok) {
                                    const postsnapData = await postsnap.json();
                                    if (postsnapData.screenshot) {
                                                  frames.push({ label, image: postsnapData.screenshot, url: endUrl });
                                    }
                        }

                report.push({ element: el.text, tag: el.tag, navigated, destination: navigated ? endUrl : null });

                // Go back if navigated
                if (navigated) {
                            await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/navigate`, {
                                          method: 'POST',
                                          headers: steelHeaders,
                                          body: JSON.stringify({ url, wait_until: 'domcontentloaded' })
                            });
                            await new Promise(r => setTimeout(r, 800));
                }

              } catch (e) {
                        report.push({ element: el.text, tag: el.tag, error: e.message.slice(0, 100) });
                        frames.push({ label: `❌ "${el.text}": ${e.message.slice(0, 80)}`, image: null, error: true });
              }
      }

      // Step 6: Release Steel session
      await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/release`, {
              method: 'POST',
              headers: steelHeaders
      });

      const working = report.filter(r => r.navigated).length;
        const dead = report.filter(r => !r.navigated && !r.error).length;

      return Response.json({
              ok: true,
              frames: frames.filter(f => f.image),
              report,
              summary: `Found ${elements.length} elements — ${working} navigate somewhere, ${dead} trigger JS actions`
      });

  } catch (err) {
        // Always release session on error
      if (sessionId) {
              await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/release`, {
                        method: 'POST',
                        headers: steelHeaders
              }).catch(() => {});
      }
        return Response.json({
                ok: false,
                error: err.message,
                frames: frames.filter(f => f.image),
                report
        });
  }
}
