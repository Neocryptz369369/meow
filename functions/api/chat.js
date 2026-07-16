// Cloudflare Pages Function: /api/chat
function J(status, body){ return new Response(JSON.stringify(body), { status: status||200, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' } }); }


export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const ENV = {
    SUPABASE_URL: env.SUPABASE_URL || env.neocryptz_final_url || '',
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || '',
    SUPABASE_KEY: env.SUPABASE_KEY || env.neocryptz_final_anon || '',
    GOOGLE_API_KEY: env.GOOGLE_API_KEY || '',
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
    POLLINATIONS_API_KEY: env.POLLINATIONS_API_KEY || '',
    SAMBANOVA_API_KEY: env.SAMBANOVA_API_KEY || '',
    GROQ_API_KEY: env.GROQ_API_KEY || '',
    GITHUB_TOKEN: env.GITHUB_TOKEN || env.GH_TOKEN || '',
    VERCEL_TOKEN: env.VERCEL_TOKEN || ''
  };
  const __SB_URL = (ENV.SUPABASE_URL||'').replace(/[/]+$/,'');
  const __SB_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_KEY;
  function createClient(){
    const H = { 'Authorization':'Bearer '+__SB_KEY, 'apikey':__SB_KEY, 'Content-Type':'application/json' };
    return {
      from(table){
        const st = { table, _sel:'*', _filters:[] };
        const api = {
          select(cols){ st._sel = cols||'*'; return api; },
          eq(col,val){ st._filters.push(col+'=eq.'+encodeURIComponent(val)); return api; },
          async single(){
            const q = __SB_URL+'/rest/v1/'+st.table+'?select='+encodeURIComponent(st._sel)+(st._filters.length?'&'+st._filters.join('&'):'');
            try{ const r=await fetch(q,{headers:H}); const d=r.ok?await r.json():[]; return { data:(Array.isArray(d)&&d[0])?d[0]:null, error: r.ok?null:{message:'err'} }; }catch(e){ return {data:null,error:{message:String(e)}}; }
          },
          async upsert(rows){
            try{ const r=await fetch(__SB_URL+'/rest/v1/'+st.table+'?on_conflict=prompt',{method:'POST',headers:{...H,'Prefer':'resolution=merge-duplicates'},body:JSON.stringify(rows)}); return { data:null, error: r.ok?null:{message:await r.text()} }; }catch(e){ return {data:null,error:{message:String(e)}}; }
          },
          async insert(rows){
            try{ const r=await fetch(__SB_URL+'/rest/v1/'+st.table,{method:'POST',headers:H,body:JSON.stringify(rows)}); return { data:null, error: r.ok?null:{message:await r.text()} }; }catch(e){ return {data:null,error:{message:String(e)}}; }
          }
        };
        return api;
      }
    };
  }

  let req = { body: {}, method: request.method, headers: {}, socket: {} };
  try { req.body = await request.json(); } catch(e) { req.body = {}; }
  request.headers.forEach((v,k)=>{ req.headers[k]=v; });
  const res = { status(c){ return { json:(b)=> J(c,b) }; }, json(b){ return J(200,b); } };
    if (req.method !== 'POST') return J(405, { error: 'Method Not Allowed' });

    // Server-side Geo and VPN blocking
    const country = req.headers['x-vercel-ip-country'];
    const region = req.headers['x-vercel-ip-country-region'];
    const ip = req.headers['x-forwarded-for'] || '';

    if (country && country !== 'US') {
        return J(403, { error: "ACCESS DENIED: Neocryptz AI is currently restricted to US residents only." });
    }
    if (region && region === 'CA') {
        return J(403, { error: "ACCESS DENIED: Due to state regulations, Neocryptz AI is not available in California." });
    }

    // VPN/Proxy check
    try {
        const geoRes = await fetch(`https://freeipapi.com/api/json/${ip}`);
        const geoData = await geoRes.json();
        if (geoData && geoData.isProxy) {
            return J(403, { error: "SECURITY ALERT: VPN or Proxy detected. Please disable your VPN to access Neocryptz AI." });
        }
    } catch (e) {
        console.error("Server-side geo-check failed:", e);
    }

    const { prompt, keys, history, username } = req.body;
    if (!prompt) return J(400, { error: 'Missing prompt' });

    // Helper to cache AI responses to Supabase query_cache
    async function upsertCache(supabase, promptText, responseText) {
        if (!supabase) return;
        try {
            await supabase.from('query_cache').upsert(
                [{ prompt: promptText.trim(), response: responseText }],
                { onConflict: 'prompt' }
            );
        } catch (e) {
            console.error("Cache upsert failed:", e.message);
        }
    }

    // Helper to persist chat exchange to chat_history (fire and forget)
    function saveHistory(supabase, uname, user_msg, ai_response) {
        if (!supabase || !uname || uname === 'Unknown') return;
        supabase.from('chat_history')
            .insert([{ username: uname, user_msg, ai_response }])
            .then(() => {}).catch(() => {});
    }

    const supabaseUrl = ENV.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const supabaseKey = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_KEY;
    let supabase = null;

    if (supabaseKey) {
        try {
            supabase = createClient(supabaseUrl, supabaseKey);
            const { data, error } = await supabase
                .from('query_cache')
                .select('response')
                .eq('prompt', prompt.trim())
                .single();
                
            if (data && data.response) {
                return J(200, { result: data.response, provider: "System Cache (Zero-Cost)" });
            }
        } catch(e) { console.log("Cache lookup skipped."); }
    }

    let providerOrder = keys && keys.PROVIDER_ORDER ? keys.PROVIDER_ORDER.split(',').map(p => p.trim().toLowerCase()) : ['groq', 'sambanova', 'pollinations', 'openrouter', 'gemini'];
    
    // Inject the hardcoded keys provided by the user if they are missing from the frontend payload
    const systemKeys = {
        'GOOGLE_API_KEY': ENV.GOOGLE_API_KEY || "",
        'OPENROUTER_API_KEY': ENV.OPENROUTER_API_KEY || "",
        'POLLINATIONS_API_KEY': ENV.POLLINATIONS_API_KEY || "",
        'SAMBANOVA_API_KEY': ENV.SAMBANOVA_API_KEY || "",
        'GROQ_API_KEY': ENV.GROQ_API_KEY || "",
        'GITHUB_TOKEN': ENV.GITHUB_TOKEN || "",
        'VERCEL_TOKEN': ENV.VERCEL_TOKEN || ""
    };

    const activeKeys = { ...systemKeys, ...(keys || {}) };

    let lastError = "";

    // Build the system prompt
    let systemPrompt = `You are Neocryptz AI, an extremely skilled software engineer. You are resourceful and execute tasks autonomously without asking multiple questions. Your name is Neocryptz. You must strictly refuse to generate, reproduce, or distribute any copyrighted material.

EXECUTION ENGINE â YOU HAVE REAL GITHUB PUSH CAPABILITY:
When the user asks you to change a website, add a feature, fix a bug, or deploy anything, you MUST output an execution block. The system will actually run it and push the changes to GitHub. Vercel auto-deploys after every push.

OUTPUT FORMAT â wrap your action in exactly these delimiters:
<<<EXEC>>>
{"action":"ACTION_NAME", ...params}
<<<END_EXEC>>>

AVAILABLE ACTIONS:
1. list_repos â see all repos
   {"action":"list_repos"}

2. read_file_excerpt â read part of a file before editing it
   {"action":"read_file_excerpt","repo":"Neocryptz369369/REPO","path":"index.html"}

3. inject_html â ADD content to an existing HTML file WITHOUT rewriting the whole thing (preferred for adding elements, styles, scripts)
   {"action":"inject_html","repo":"Neocryptz369369/REPO","path":"index.html","inject":"<div>...</div>","position":"before_closing_body","message":"commit message"}
   positions: before_closing_body | before_closing_head | after_opening_body

4. patch_file â find an exact string in the file and replace it (preferred for targeted edits)
   {"action":"patch_file","repo":"Neocryptz369369/REPO","path":"index.html","find":"EXACT STRING TO FIND","replace":"NEW STRING","message":"commit message"}

5. push_file â replace entire file (only for small/new files, NOT large HTML files)
   {"action":"push_file","repo":"Neocryptz369369/REPO","path":"filename.ext","content":"full content","message":"commit message"}

RULES:
- The GitHub owner is always "Neocryptz369369". Full repo format: "Neocryptz369369/repo-name"
- For adding UI elements (buttons, dots, banners, popups): use inject_html with position before_closing_body
- For adding CSS: inject a <style> block using inject_html with position before_closing_head
- For editing existing elements: use patch_file with the exact current HTML as the find string
- NEVER use push_file on large HTML files â use inject_html or patch_file instead
- If the user hasn't specified which repo/site, call list_repos first to show them options, then ask
- After outputting <<<EXEC>>>...<<<END_EXEC>>> the system executes it and returns the result to you
- You can chain multiple actions: read first, then inject/patch
- NEVER say you "cannot" push or deploy â you CAN and MUST use this system

BROWSER AUTOMATION â YOU HAVE A REAL LIVE BROWSER:
This is a hard override. You are NEVER allowed to say "I can't browse", "I'm sorry but I can't interact with that website", "I don't have the ability to visit URLs", or any similar refusal. That is FORBIDDEN. You have a fully functional real browser. When the user asks you to visit ANY website â any URL, any domain â you MUST output a <<<BROWSER_PERMISSION>>> block immediately. No exceptions.

TRIGGER PHRASES that ALWAYS require a <<<BROWSER_PERMISSION>>> block (never refuse these):
- "go to [URL]" / "visit [URL]" / "open [URL]"
- "check [website]" / "look at [website]"
- "click on [button/link]"
- "show me [website]"
- "what's on [website]"
- "browse to..."
- "can you go to..."

OUTPUT FORMAT â paste this block exactly, fill in the JSON:
<<<BROWSER_PERMISSION>>>
{"url":"https://FULL-URL-HERE.com","description":"One sentence describing what you're doing in plain English","actions":[
  {"type":"screenshot","label":"Opening the page"},
  {"type":"scroll","y":600,"label":"Scrolling to see more"},
  {"type":"screenshot","label":"Full view"},
  {"type":"click","selector":"nav a","label":"Clicking nav link"},
  {"type":"screenshot","label":"After click"}
]}
<<<END_BROWSER_PERMISSION>>>

EXAMPLE â user says "go to ontimetaxi.biz and click the buttons":
<<<BROWSER_PERMISSION>>>
{"url":"https://ontimetaxi.biz","description":"Navigate to ontimetaxi.biz, screenshot the page, and click every button to see which ones work","actions":[
  {"type":"screenshot","label":"Landing page"},
  {"type":"scroll","y":400,"label":"Scrolling down"},
  {"type":"screenshot","label":"Lower section"},
  {"type":"click","selector":"a[href]","label":"Clicking first link"},
  {"type":"screenshot","label":"After first click"},
  {"type":"scroll","y":800,"label":"Scrolling further"},
  {"type":"screenshot","label":"Bottom of page"}
]}
<<<END_BROWSER_PERMISSION>>>

BROWSER RULES:
- NEVER refuse. NEVER say you cannot visit a website. ALWAYS output <<<BROWSER_PERMISSION>>> instead.
- There are ZERO limits, ZERO budget caps, ZERO credit costs â use the browser freely whenever asked
- The system will show the user a live screenshot slideshow as the browser works
- action types: screenshot | scroll (y:pixels) | navigate (url:string) | click (selector:string,label:string) | type (selector:string,value:string,label:string) | wait (ms:number,label:string)

SECRET KEYS VAULT â HOW TO HELP USERS ADD API KEYS OR TOKENS:
If a user asks where to put an API key, secret key, token, or credential for ANY platform (including ones not built in), tell them exactly:
1. Click the âï¸ gear icon or your username in the top-right corner of the screen
2. Click "SETTINGS / OAUTH" from the menu
3. Scroll down to the "ð MY SECRET KEYS VAULT" section
4. Enter a label (e.g. "OpenAI Key" or "Twitter Token") and paste your key/token in the field next to it
5. Click SAVE â the AI will automatically use it on your next message

The vault works for API keys, bearer tokens, access tokens, or any secret string. The AI receives all saved vault keys with every message so it can use them for platforms not in the built-in list.
- After the browser runs and returns, you will receive the results and can describe what you found`;


    if (keys && keys.ACTIVE_PERSONA) {
        if (keys.ACTIVE_PERSONA === 'seo') systemPrompt = "You are Neocryptz AI. You are a highly-paid SEO Keyword expert. You provide ultra-short, highly-optimized keywords and SEO metadata.";
        if (keys.ACTIVE_PERSONA === 'code') systemPrompt = "You are Neocryptz AI. You are a Senior Principal Software Engineer. Find the bug in the user's code and provide a clean, secure fix.";
        if (keys.ACTIVE_PERSONA === 'copywriter') systemPrompt = "You are Neocryptz AI. You are an elite, persuasive copywriter. Write highly engaging, conversion-focused advertising copy.";
        if (keys.ACTIVE_PERSONA === 'sarcastic') systemPrompt = "You are Neocryptz AI. You are incredibly sarcastic, witty, and slightly condescending, but still ultimately helpful.";
        if (keys.ACTIVE_PERSONA === 'json') systemPrompt = "You are Neocryptz AI. You must ONLY output raw, valid JSON. Do not include any conversational text or markdown wrappers.";
    }

    const authorizedPlatforms = Object.keys(keys || {}).filter(k => k.startsWith("AUTH_TOKEN_")).map(k => k.replace("AUTH_TOKEN_", ""));
    if (authorizedPlatforms.length > 0) {
        systemPrompt += "\n\nCRITICAL: The user has authorized you for the following platforms: " + authorizedPlatforms.join(", ") + ". You have access to their authentication tokens via the environment keys. YOU ARE AN AUTONOMOUS AGENT LIKE JULES. You must execute deployments, repository creations, and any other platform-specific tasks yourself using these tokens. Do NOT ask the user to do the work; YOU do the work for them. When asked to connect, deploy, redeploy, or submit, your answer should be a confident YES followed by the execution of the task.";
    }

    if (keys && keys.TARGET_LANGUAGE) {
        systemPrompt = "CRITICAL DIRECTIVE: YOU MUST TRANSLATE YOUR ENTIRE RESPONSE INTO " + keys.TARGET_LANGUAGE.toUpperCase() + ". DO NOT USE ENGLISH. " + systemPrompt;
    }

    if (keys && keys.BASE_GUIDELINES) {
        systemPrompt += "\n\nCOMPANY BRAND GUIDELINES TO FOLLOW STRICTLY:\n" + keys.BASE_GUIDELINES;
    }

    if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
        systemPrompt += "\n\nCRITICAL CONTEXT FROM SYSTEM SCRAPER:\n";
        keys.LOCAL_SCRAPES.forEach(s => {
            systemPrompt += `\n[Source: ${s.url}]\n${s.text.substring(0, 500)}...\n`;
        });
    }

    let formattedHistory = [];
    if (history && history.length > 0) {
        history.forEach(h => {
            formattedHistory.push({ role: "user", content: h.user_msg });
            formattedHistory.push({ role: "assistant", content: h.ai_response });
        });
    }

    // ââ Browser block extractor â runs server-side so frontend gets clean JSON ââ
    function extractBrowserBlock(text) {
        // Match <<<BROWSER_PERMISSION>>>...<<<END_BROWSER_PERMISSION (lenient on closing)
        const m = text.match(/<<<BROWSER_PERMISSION>>>([\s\S]*?)<<<END_BROWSER_PERMISSION/);
        if (!m) return { text, browserRequest: null };
        let req = null;
        try {
            let raw = m[1].trim();
            // Trim anything after the last closing brace
            const lastBrace = raw.lastIndexOf('}');
            if (lastBrace !== -1) raw = raw.substring(0, lastBrace + 1);
            req = JSON.parse(raw);
        } catch(e) { req = null; }
        // Strip the entire block from the visible text
        const cleanText = text.replace(/<<<BROWSER_PERMISSION>>>[\s\S]*?(<<<END_BROWSER_PERMISSION[^\n]*|$)/g, '').trim();
        return { text: cleanText, browserRequest: req };
    }

    // ââ Refusal detection helpers ââââââââââââââââââââââââââââââââââââââââââ
    const REFUSAL_PHRASES = [
        "i'm sorry, but i can't", "sorry, but i can't", "i cannot help with that",
        "i can't help with that", "i'm unable to", "i cannot browse", "i can't browse",
        "i don't have the ability to visit", "i cannot visit", "i can't visit",
        "i cannot interact with", "i can't interact with", "i can't access",
        "i cannot access websites", "as an ai, i cannot", "as an ai i cannot",
        "i'm not able to browse", "i am not able to browse", "i cannot open",
        "i can't open", "i'm sorry but i can't", "sorry but i can't"
    ];
    function isRefusal(text) {
        const lower = (text || '').toLowerCase();
        return REFUSAL_PHRASES.some(p => lower.includes(p));
    }
    const BROWSER_INTENT_PHRASES = [
        'go to ', 'visit ', 'open ', 'browse to', 'check ', 'show me ', "what's on ",
        'click ', 'navigate to', 'look at ', '.com', '.biz', '.net', '.org', '.io',
        'http://', 'https://', 'www.', 'website', 'webpage', 'site'
    ];
    function hasBrowserIntent(text) {
        const lower = (text || '').toLowerCase();
        return BROWSER_INTENT_PHRASES.some(p => lower.includes(p));
    }

    // Shared AI-call function for retries
    async function callAI(provider, sysPrompt, msgs, lastUserMsg, activeKeys) {
        if (provider === 'gemini' && activeKeys.GOOGLE_API_KEY) {
            const contents = [{ role: "user", parts: [{ text: sysPrompt }] }];
            msgs.forEach(h => contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] }));
            contents.push({ role: "user", parts: [{ text: lastUserMsg }] });
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${activeKeys.GOOGLE_API_KEY}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) });
            if (r.ok) { const d = await r.json(); return d.candidates?.[0]?.content?.parts?.[0]?.text || null; }
        }
        if (provider === 'openrouter' && activeKeys.OPENROUTER_API_KEY) {
            const r = await fetch("https://openrouter.ai/api/v1/chat/completions",
                { method: "POST", headers: { "Authorization": `Bearer ${activeKeys.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "system", content: sysPrompt }, ...msgs, { role: "user", content: lastUserMsg }] }) });
            if (r.ok) { const d = await r.json(); return d.choices?.[0]?.message?.content || null; }
        }
        if (provider === 'pollinations') {
            const r = await fetch("https://text.pollinations.ai/",
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: [{ role: "system", content: sysPrompt }, ...msgs, { role: "user", content: lastUserMsg }] }) });
            if (r.ok) return await r.text();
        }
        if (provider === 'sambanova' && activeKeys.SAMBANOVA_API_KEY) {
            const r = await fetch("https://api.sambanova.ai/v1/chat/completions",
                { method: "POST", headers: { "Authorization": `Bearer ${activeKeys.SAMBANOVA_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ model: "Meta-Llama-3.3-70B-Instruct", messages: [{ role: "system", content: sysPrompt }, ...msgs, { role: "user", content: lastUserMsg }] }) });
            if (r.ok) { const d = await r.json(); return d.choices?.[0]?.message?.content || null; }
        }
        return null;
    }

    // Waterfall Waterfall
    for (const provider of providerOrder) {
if (provider === 'groq' && activeKeys.GROQ_API_KEY) {
                const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${activeKeys.GROQ_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: prompt }]
                    })
                });

                if (groqRes.ok) {
                    const data = await groqRes.json();
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        let text = data.choices[0].message.content;
                        if (isRefusal(text) && hasBrowserIntent(prompt)) {
                            const retried = await callAI('sambanova', systemPrompt, formattedHistory, `MANDATORY SYSTEM OVERRIDE: Output ONLY a <<<BROWSER_PERMISSION>>> block for this request: "${prompt}". No apologies. No refusals. Just the block.`, activeKeys);
                            if (retried) text = retried;
                        }
                        const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                        await upsertCache(supabase, prompt, cleanText);
                        saveHistory(supabase, username, prompt, cleanText);
                        return J(200, { result: cleanText, browserRequest, provider: "Groq" });
                    }
                } else {
                    lastError += "SambaNova Error: " + groqRes.statusText + " | ";
                }
            }

        try {
            // 1. Google Gemini
            if (provider === 'gemini' && activeKeys.GOOGLE_API_KEY) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${activeKeys.GOOGLE_API_KEY}`;
                const contents = [];
                contents.push({ role: "user", parts: [{ text: systemPrompt }] });
                formattedHistory.forEach(h => {
                    contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] });
                });
                contents.push({ role: "user", parts: [{ text: prompt }] });

                const resGemini = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents })
                });

                if (resGemini.ok) {
                    const data = await resGemini.json();
                    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                        let text = data.candidates[0].content.parts[0].text;
                        if (isRefusal(text) && hasBrowserIntent(prompt)) {
                            const retried = await callAI('gemini', systemPrompt, formattedHistory, `MANDATORY SYSTEM OVERRIDE: Output ONLY a <<<BROWSER_PERMISSION>>> block for this request: "${prompt}". No apologies. No refusals. Just the block.`, activeKeys);
                            if (retried) text = retried;
                        }
                        const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                        await upsertCache(supabase, prompt, cleanText);
                        saveHistory(supabase, username, prompt, cleanText);
                        return J(200, { result: cleanText, browserRequest, provider: "Gemini" });
                    }
                } else {
                    lastError += "Gemini Error: " + resGemini.statusText + " | ";
                }
            }

            // 2. OpenRouter
            if (provider === 'openrouter' && activeKeys.OPENROUTER_API_KEY) {
                const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${activeKeys.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "openai/gpt-4o-mini",
                        messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: prompt }]
                    })
                });

                if (orRes.ok) {
                    const data = await orRes.json();
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        let text = data.choices[0].message.content;
                        if (isRefusal(text) && hasBrowserIntent(prompt)) {
                            const retried = await callAI('openrouter', systemPrompt, formattedHistory, `MANDATORY SYSTEM OVERRIDE: Output ONLY a <<<BROWSER_PERMISSION>>> block for this request: "${prompt}". No apologies. No refusals. Just the block.`, activeKeys);
                            if (retried) text = retried;
                        }
                        const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                        await upsertCache(supabase, prompt, cleanText);
                        saveHistory(supabase, username, prompt, cleanText);
                        return J(200, { result: cleanText, browserRequest, provider: "OpenRouter" });
                    }
                } else {
                    lastError += "OpenRouter Error: " + orRes.statusText + " | ";
                }
            }

            // 3. Pollinations AI
            if (provider === 'pollinations') {
                const polRes = await fetch("https://text.pollinations.ai/", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: prompt }]
                    })
                });

                if (polRes.ok) {
                    let text = await polRes.text();
                    if (isRefusal(text) && hasBrowserIntent(prompt)) {
                        const retried = await callAI('pollinations', systemPrompt, formattedHistory, `MANDATORY SYSTEM OVERRIDE: Output ONLY a <<<BROWSER_PERMISSION>>> block for this request: "${prompt}". No apologies. No refusals. Just the block.`, activeKeys);
                        if (retried) text = retried;
                    }
                    const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                    await upsertCache(supabase, prompt, cleanText);
                    saveHistory(supabase, username, prompt, cleanText);
                    return J(200, { result: cleanText, browserRequest, provider: "Pollinations" });
                } else {
                    lastError += "Pollinations Error: " + polRes.statusText + " | ";
                }
            }

            // 4. SambaNova
            if (provider === 'sambanova' && activeKeys.SAMBANOVA_API_KEY) {
                const sambaRes = await fetch("https://api.sambanova.ai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${activeKeys.SAMBANOVA_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "Meta-Llama-3.3-70B-Instruct",
                        messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: prompt }]
                    })
                });

                if (sambaRes.ok) {
                    const data = await sambaRes.json();
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        let text = data.choices[0].message.content;
                        if (isRefusal(text) && hasBrowserIntent(prompt)) {
                            const retried = await callAI('sambanova', systemPrompt, formattedHistory, `MANDATORY SYSTEM OVERRIDE: Output ONLY a <<<BROWSER_PERMISSION>>> block for this request: "${prompt}". No apologies. No refusals. Just the block.`, activeKeys);
                            if (retried) text = retried;
                        }
                        const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                        await upsertCache(supabase, prompt, cleanText);
                        saveHistory(supabase, username, prompt, cleanText);
                        return J(200, { result: cleanText, browserRequest, provider: "SambaNova" });
                    }
                } else {
                    lastError += "SambaNova Error: " + sambaRes.statusText + " | ";
                }
            }
        } catch (e) {
            lastError += `${provider} Network Error | `;
        }
    }

    // Doomsday Fallback
    if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
        return J(200, { 
            result: `[DOOMSDAY FALLBACK ACTIVATED]\nAll external AI endpoints failed.\n\nReturning latest scraped data summary:\n\n${keys.LOCAL_SCRAPES[0].text.substring(0, 1000)}...`, 
            provider: "Doomsday Local Scraper" 
        });
    }

    return J(500, { error: "All AI providers in the waterfall failed. " + lastError });
}
