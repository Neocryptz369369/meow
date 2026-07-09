import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let browser = null;
    try {
      if (!env.BROWSER) {
        throw new Error("Missing BROWSER hardware binding context");
      }

      // Parse payload
      let url = "https://example.com";
      let task = "";
      if (request.method === "POST") {
        try {
          const body = await request.json();
          url = body.url || url;
          task = body.task || task;
        } catch (e) {}
      } else {
        const urlObj = new URL(request.url);
        url = urlObj.searchParams.get("url") || url;
        task = urlObj.searchParams.get("task") || task;
      }

      if (!url.startsWith("http")) {
        url = "https://" + url;
      }

      const sessions = await puppeteer.sessions(env.BROWSER).catch(() => []);
      if (sessions && sessions.length > 0 && sessions[0]?.sessionId) {
        browser = await puppeteer.connect(env.BROWSER, {
          sessionId: sessions[0].sessionId
        });
      } else {
        browser = await puppeteer.launch(env.BROWSER);
      }

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });

      const frames = [];

      // Step 1: Navigate to the URL
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      const img1 = await page.screenshot({ type: "jpeg", quality: 60 });
      frames.push({
        image: Buffer.from(img1).toString("base64"),
        label: `Loaded page ${url}`,
        url: page.url()
      });

      // Step 2: Scroll down to simulate browsing
      await page.evaluate(() => window.scrollBy(0, 450));
      await new Promise(resolve => setTimeout(resolve, 800));
      const img2 = await page.screenshot({ type: "jpeg", quality: 60 });
      frames.push({
        image: Buffer.from(img2).toString("base64"),
        label: `Scrolled down 450px to view more content`,
        url: page.url()
      });

      // Step 3: Analyze links and buttons
      const clickReport = [];
      const links = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("a, button, [role='button']"));
        return elements.slice(0, 5).map(el => ({
          text: el.innerText?.trim() || el.getAttribute("aria-label") || el.tagName,
          tagName: el.tagName
        })).filter(el => el.text && el.text.length < 50);
      });

      if (links.length > 0) {
        try {
          const clickText = links[0].text;
          await page.evaluate((text) => {
            const el = Array.from(document.querySelectorAll("a, button, [role='button']"))
              .find(e => (e.innerText?.trim() || e.getAttribute("aria-label")) === text);
            if (el) el.click();
          }, clickText);

          await new Promise(resolve => setTimeout(resolve, 2000));
          const img3 = await page.screenshot({ type: "jpeg", quality: 60 });
          frames.push({
            image: Buffer.from(img3).toString("base64"),
            label: `Clicked element "${clickText}"`,
            url: page.url()
          });

          clickReport.push({
            element: clickText,
            navigated: true,
            destination: page.url()
          });
        } catch (err) {
          clickReport.push({
            element: links[0].text,
            navigated: false,
            error: err.message
          });
        }
      }

      await browser.close();

      return new Response(
        JSON.stringify({
          ok: true,
          frames,
          summary: `Completed browser actions for ${url}. Task executed: "${task || 'Default browse'}".`,
          report: clickReport
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );

    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Cloudflare Puppeteer automation failure: ${err.message || err}`
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
  },
};
