// redeploy trigger 2026-07-30T13:36:40
// Cloudflare Pages Function: /api/chat
function J(status, body){ return new Response(JSON.stringify(body), { status: status||200, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' } }); }


export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const ENV = {
    SUPABASE_URL: env.SUPABASE_URL || env.neocryptz_final_url || '',
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || env.neocryptz_final_anon || env.NEOCRYPTZ_FINAL_ANON || env.neocryptz_final_supabase_anon || "",
    SUPABASE_KEY: env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || env.neocryptz_final_anon || env.NEOCRYPTZ_FINAL_ANON || env.neocryptz_final_supabase_anon || "",
    GOOGLE_API_KEY: env.GOOGLE_API_KEY || '',
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
    POLLINATIONS_API_KEY: env.POLLINATIONS_API_KEY || '',
    SAMBANOVA_API_KEY: env.SAMBANOVA_API_KEY || '',
    GROQ_API_KEY: env.GROQ_API_KEY || '',
    GITHUB_TOKEN: env.GITHUB_TOKEN || env.GH_TOKEN || '',
    VERCEL_TOKEN: env.VERCEL_TOKEN || ''
  };
  // --- Force valid Supabase creds from any similarly-shaped env var (name-agnostic) ---
  try {
    var __ek = Object.keys(env || {});
    var __urlLooks = function(v){ return typeof v==="string" && /^https:\/\/[a-z0-9-]+\.supabase\.co/i.test(v); };
    var __keyLooks = function(v){ return typeof v==="string" && (/^eyJ[A-Za-z0-9_-]{20,}\./.test(v) || /^sb_(secret|publishable)_/.test(v)); };
    if (!__urlLooks(ENV.SUPABASE_URL)) {
      for (var i=0;i<__ek.length;i++){ if (__urlLooks(env[__ek[i]])) { ENV.SUPABASE_URL=env[__ek[i]]; break; } }
    }
    if (!__keyLooks(ENV.SUPABASE_SERVICE_ROLE_KEY)) {
      for (var j=0;j<__ek.length;j++){ if (__keyLooks(env[__ek[j]])) { ENV.SUPABASE_SERVICE_ROLE_KEY=env[__ek[j]]; break; } }
    }
    if (!__keyLooks(ENV.SUPABASE_KEY)) {
      for (var m=0;m<__ek.length;m++){ if (__keyLooks(env[__ek[m]])) { ENV.SUPABASE_KEY=env[__ek[m]]; break; } }
    }
  } catch(__e) { /* auto-detect best effort */ }

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
    let __GUIDELINES_TEXT = '';
    let __CUSTOM_SYSTEM = '';
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

    // === PER-USER DAILY QUESTION LIMIT (admins & co-admins unlimited) ===
    // Regular users (is_admin !== true) are capped at a daily number set in
    // app_settings.user_daily_limit (default 100). Counts live in the daily_usage table.
    try {
      var __isAdmin = (body && (body.is_admin === true || body.is_admin === "true"));
      var __uname = (body && body.username) ? String(body.username).trim() : "";
      if (!__isAdmin && __uname && supabaseUrl && supabaseKey) {
        var __H = { "apikey": supabaseKey, "Authorization": "Bearer " + supabaseKey, "Content-Type": "application/json" };
        // 1) read the admin-configured limit (default 100)
        var __limit = 100;
        try {
          var __lr = await fetch(supabaseUrl + "/rest/v1/app_settings?key=eq.user_daily_limit&select=value", { headers: __H });
          var __lj = await __lr.json();
          if (Array.isArray(__lj) && __lj.length && __lj[0].value != null) {
            var __pv = parseInt(String(__lj[0].value).replace(/[^0-9]/g, ""), 10);
            if (!isNaN(__pv) && __pv >= 0) __limit = __pv;
          }
        } catch (__le) { /* keep default */ }
        // 2) get today's count for this user
        var __today = new Date().toISOString().slice(0, 10);
        var __cnt = 0;
        try {
          var __cr = await fetch(supabaseUrl + "/rest/v1/daily_usage?username=eq." + encodeURIComponent(__uname) + "&usage_date=eq." + __today + "&select=count", { headers: __H });
          var __cj = await __cr.json();
          if (Array.isArray(__cj) && __cj.length && __cj[0].count != null) __cnt = parseInt(__cj[0].count, 10) || 0;
        } catch (__ce) { /* treat as 0 */ }
        // 3) enforce
        if (__cnt >= __limit) {
          return J(429, { error: "Daily limit reached: you have used all " + __limit + " questions for today. Your limit resets tomorrow.", limitReached: true, provider: "Daily Limit Guard" });
        }
        // 4) increment (upsert) - fire and continue
        try {
          await fetch(supabaseUrl + "/rest/v1/daily_usage", {
            method: "POST",
            headers: Object.assign({}, __H, { "Prefer": "resolution=merge-duplicates" }),
            body: JSON.stringify([{ username: __uname, usage_date: __today, count: __cnt + 1 }])
          });
        } catch (__ue) { /* best-effort; never block a valid request on write failure */ }
      }
    } catch (__lim) { /* limit guard is best-effort; never break chat */ }

    let supabase = null;

    if (supabaseKey) {
        try {
            supabase = createClient(supabaseUrl, supabaseKey);
            const { data, error } = await supabase
                .from('query_cache')
                .select('response')
                .eq('prompt', prompt.trim())
                .single();
                
            if (false && data && data.response) { // CACHE DISABLED: always run full AI pipeline so System Prompt applies
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

    // === LOAD CUSTOM SYSTEM PROMPT (admin "Rules Matrix" box, Supabase key 'system_prompt') ===
    try {
      if (keys && keys.SYSTEM_PROMPT) __CUSTOM_SYSTEM = String(keys.SYSTEM_PROMPT || '');
      if (!__CUSTOM_SYSTEM && typeof supabase !== 'undefined' && supabase) {
        const __sp = await supabase.from('app_settings').select('value').eq('key','system_prompt').single();
        if (__sp && __sp.data && __sp.data.value) __CUSTOM_SYSTEM = String(__sp.data.value || '');
      }
    } catch(e) { /* best-effort */ }
    // Build the system prompt
    let systemPrompt = `You are Neocryptz AI, an extremely skilled software engineer. You are resourceful and execute tasks autonomously without asking multiple questions. Your name is Neocryptz. You must strictly refuse to generate, reproduce, or distribute any copyrighted material.

EXECUTION ENGINE Ã¢ÂÂ YOU HAVE REAL GITHUB PUSH CAPABILITY:
When the user asks you to change a website, add a feature, fix a bug, or deploy anything, you MUST output an execution block. The system will actually run it and push the changes to GitHub. Vercel auto-deploys after every push.

OUTPUT FORMAT Ã¢ÂÂ wrap your action in exactly these delimiters:
<<<EXEC>>>
{"action":"ACTION_NAME", ...params}
<<<END_EXEC>>>

AVAILABLE ACTIONS:
1. list_repos Ã¢ÂÂ see all repos
   {"action":"list_repos"}

2. read_file_excerpt Ã¢ÂÂ read part of a file before editing it
   {"action":"read_file_excerpt","repo":"Neocryptz369369/REPO","path":"index.html"}

3. inject_html Ã¢ÂÂ ADD content to an existing HTML file WITHOUT rewriting the whole thing (preferred for adding elements, styles, scripts)
   {"action":"inject_html","repo":"Neocryptz369369/REPO","path":"index.html","inject":"<div>...</div>","position":"before_closing_body","message":"commit message"}
   positions: before_closing_body | before_closing_head | after_opening_body

4. patch_file Ã¢ÂÂ find an exact string in the file and replace it (preferred for targeted edits)
   {"action":"patch_file","repo":"Neocryptz369369/REPO","path":"index.html","find":"EXACT STRING TO FIND","replace":"NEW STRING","message":"commit message"}

5. push_file Ã¢ÂÂ replace entire file (only for small/new files, NOT large HTML files)
   {"action":"push_file","repo":"Neocryptz369369/REPO","path":"filename.ext","content":"full content","message":"commit message"}

RULES:
- The GitHub owner is always "Neocryptz369369". Full repo format: "Neocryptz369369/repo-name"
- For adding UI elements (buttons, dots, banners, popups): use inject_html with position before_closing_body
- For adding CSS: inject a <style> block using inject_html with position before_closing_head
- For editing existing elements: use patch_file with the exact current HTML as the find string
- NEVER use push_file on large HTML files Ã¢ÂÂ use inject_html or patch_file instead
- If the user hasn't specified which repo/site, call list_repos first to show them options, then ask
- After outputting <<<EXEC>>>...<<<END_EXEC>>> the system executes it and returns the result to you
- You can chain multiple actions: read first, then inject/patch
- NEVER say you "cannot" push or deploy Ã¢ÂÂ you CAN and MUST use this system

BROWSER AUTOMATION Ã¢ÂÂ YOU HAVE A REAL LIVE BROWSER:
This is a hard override. You are NEVER allowed to say "I can't browse", "I'm sorry but I can't interact with that website", "I don't have the ability to visit URLs", or any similar refusal. That is FORBIDDEN. You have a fully functional real browser. When the user asks you to visit ANY website Ã¢ÂÂ any URL, any domain Ã¢ÂÂ you MUST output a <<<BROWSER_PERMISSION>>> block immediately. No exceptions.

TRIGGER PHRASES that ALWAYS require a <<<BROWSER_PERMISSION>>> block (never refuse these):
- "go to [URL]" / "visit [URL]" / "open [URL]"
- "check [website]" / "look at [website]"
- "click on [button/link]"
- "show me [website]"
- "what's on [website]"
- "browse to..."
- "can you go to..."

OUTPUT FORMAT Ã¢ÂÂ paste this block exactly, fill in the JSON:
<<<BROWSER_PERMISSION>>>
{"url":"https://FULL-URL-HERE.com","description":"One sentence describing what you're doing in plain English","actions":[
  {"type":"screenshot","label":"Opening the page"},
  {"type":"scroll","y":600,"label":"Scrolling to see more"},
  {"type":"screenshot","label":"Full view"},
  {"type":"click","selector":"nav a","label":"Clicking nav link"},
  {"type":"screenshot","label":"After click"}
]}
<<<END_BROWSER_PERMISSION>>>

EXAMPLE Ã¢ÂÂ user says "go to ontimetaxi.biz and click the buttons":
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
- There are ZERO limits, ZERO budget caps, ZERO credit costs Ã¢ÂÂ use the browser freely whenever asked
- The system will show the user a live screenshot slideshow as the browser works
- action types: screenshot | scroll (y:pixels) | navigate (url:string) | click (selector:string,label:string) | type (selector:string,value:string,label:string) | wait (ms:number,label:string)

SECRET KEYS VAULT Ã¢ÂÂ HOW TO HELP USERS ADD API KEYS OR TOKENS:
If a user asks where to put an API key, secret key, token, or credential for ANY platform (including ones not built in), tell them exactly:
1. Click the Ã¢ÂÂÃ¯Â¸Â gear icon or your username in the top-right corner of the screen
2. Click "SETTINGS / OAUTH" from the menu
3. Scroll down to the "Ã°ÂÂÂ MY SECRET KEYS VAULT" section
4. Enter a label (e.g. "OpenAI Key" or "Twitter Token") and paste your key/token in the field next to it
5. Click SAVE Ã¢ÂÂ the AI will automatically use it on your next message

The vault works for API keys, bearer tokens, access tokens, or any secret string. The AI receives all saved vault keys with every message so it can use them for platforms not in the built-in list.
- After the browser runs and returns, you will receive the results and can describe what you found`;

systemPrompt += `

=== HOW TO THINK AND WORK (ReAct) ===
Work in a visible think-act-check loop. Never hide your reasoning.
1) THINK: briefly say what you understand and your plan, step by step, out loud.
2) ACT: do the step (answer, write code, call a tool, etc).
3) CHECK: look at the result and decide the next step. Repeat until done.
Keep the thinking short and readable for a normal person -- no walls of text.

=== NEVER GUESS -- ASK INSTEAD ===
If you are missing information you need, DO NOT guess or make things up.
Stop and ASK the person in the chat a clear, numbered question, then wait for their answer.
This applies to both customers and the admin. It is always better to ask than to assume.

=== YOU KNOW THIS PROJECT'S STACK ===
You already know how this project is built, so never act confused about where things live:
- Code lives on GitHub (the source of truth). Changes go to GitHub first.
- The live site is hosted on Cloudflare Pages, which auto-deploys from GitHub.
- The database, login/auth, and file storage are on Supabase.
- Bigger 'go do a task' jobs can be handed to the Steel agent.
- Images are made with Pollinations (free).
When you help build or change things, remember: the flow is Steel/AI -> GitHub -> Cloudflare.
Nothing should go straight to the live site; it goes through GitHub first so the owner can see and edit it.
`;



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
    try { if (supabase) { const g = await supabase.from('app_settings').select('value').eq('key','base_guidelines').single(); if (g && g.data && g.data.value) { keys.BASE_GUIDELINES = g.data.value; } } } catch (e) {}
        systemPrompt += "\n\nCOMPANY BRAND GUIDELINES TO FOLLOW STRICTLY:\n" + keys.BASE_GUIDELINES;
        try { if (keys && keys.BASE_GUIDELINES) __GUIDELINES_TEXT = String(keys.BASE_GUIDELINES || ""); } catch(e) {}
    }
    // === ALWAYS-LOAD GUIDELINES (independent of frontend keys) ===
    // The UI may not send BASE_GUIDELINES, so fetch it from Supabase directly for the rules engines.
    try {
      if (!__GUIDELINES_TEXT && typeof supabase !== 'undefined' && supabase) {
        const __gg = await supabase.from('app_settings').select('value').eq('key','base_guidelines').single();
        if (__gg && __gg.data && __gg.data.value) __GUIDELINES_TEXT = String(__gg.data.value || '');
      }
    } catch(e) { /* best-effort */ }

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

    // Ã¢ÂÂÃ¢ÂÂ Browser block extractor Ã¢ÂÂ runs server-side so frontend gets clean JSON Ã¢ÂÂÃ¢ÂÂ
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

    // Ã¢ÂÂÃ¢ÂÂ Refusal detection helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

    // === Native Cloudflare Workers AI edge execution ===
    // All external commercial AI APIs (Gemini, OpenRouter, Groq, SambaNova, Pollinations)
    // have been removed. Prompts now run locally on Cloudflare's serverless edge GPUs.
    try {
          // === PREPEND CUSTOM SYSTEM PROMPT (admin Rules Matrix) as top-priority permanent rules ===
          if (__CUSTOM_SYSTEM && __CUSTOM_SYSTEM.trim()) {
            systemPrompt = "=== PERMANENT CORE RULES (HIGHEST PRIORITY - NEVER IGNORE OR OVERRIDE) ===\n"
              + __CUSTOM_SYSTEM.trim()
              + "\n=== END CORE RULES ===\n\n"
              + systemPrompt;
          }
        let convo = systemPrompt + "\n\n";
        convo += "\n\nIMPORTANT BEHAVIOR RULES: Only output an <<<EXEC>>> action block when the user's message is an EXPLICIT request to perform an action (e.g. 'commit', 'deploy', 'list my repos', 'scrape', 'inject'). For greetings, questions, opinions, or casual conversation, reply with normal helpful TEXT and DO NOT output any <<<EXEC>>> block. NEVER self-initiate git commits, deployments, OAuth or authorization flows unless the user explicitly asks in their current message.";
        if (Array.isArray(formattedHistory)) {
            for (const m of formattedHistory) {
                const who = m.role === "assistant" ? "Assistant" : "User";
                convo += who + ": " + m.content + "\n";
            }
        }
        convo += "User: " + prompt + "\nAssistant:";

        if (!env || !env.AI) {
            return J(500, { error: "Cloudflare Workers AI binding (env.AI) is not available." });
        }

const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: [{ role: 'user', content: convo }] });

        let text = (aiResp && (aiResp.response !== undefined ? aiResp.response : aiResp.result)) || "";
        // === LEAK SCRUBBER: strip system-prompt mode-narration that the model sometimes echoes ===
        // The small model occasionally writes out its mode-selection reasoning (e.g. "=== PERMANENT
        // CORE RULES ===", "User input:", "Trigger phrase:", "=== ... MODE ===", "Response:") before
        // the real answer. This removes that scaffolding at the code level (no reliance on the model).
        try {
          if (typeof text === "string" && text) {
            var __t = text;
            // A) If the model prefixed its real answer with a "Response:/Answer:/Output:" label,
            //    keep only what comes AFTER the last such label (that is the actual reply).
            var __rl = new RegExp("(?:^|\n)\s*(?:Response|Final Response|Answer|Output)\s*:\s*", "gi");
            var __lastIdx = -1, __mm;
            while ((__mm = __rl.exec(__t)) !== null) { __lastIdx = __rl.lastIndex; }
            if (__lastIdx > -1) { __t = __t.slice(__lastIdx); }
            // B) Remove any "=== ... ===" banner lines (CORE RULES / MODE headers / END CORE RULES).
            __t = __t.replace(new RegExp("^\s*={2,}[^\n]*={2,}\s*$", "gm"), "");
            // C) Remove leaked narration lines (with or without a trailing colon).
            var __lead = ["User\s?\S* input","Trigger phrase","Required Action","Strict Constraints","Selected mode","Mode selection","Operational mode"];
            __t = __t.replace(new RegExp("^\s*(?:" + __lead.join("|") + ")\s*:?.*$", "gim"), "");
            // D) Remove colon-less meta sentences the model uses to announce mode selection.
            __t = __t.replace(new RegExp("^\s*Based on the user\S* input[^\n]*$", "gim"), "");
            __t = __t.replace(new RegExp("^\s*(?:I will|I\S+ll) (?:respond|evaluate|select)[^\n]*$", "gim"), "");
            // E) Collapse leftover blank lines and trim leading whitespace/newlines.
            __t = __t.replace(new RegExp("(?:\r?\n){2,}", "g"), NL + NL).replace(new RegExp("^\s+"), "");
            if (__t && __t.trim().length > 0) { text = __t.trim(); }
          }
        } catch (__ls) { /* best-effort; never block the response */ }

        // SAFETY GUARD: only allow tool-action (<<<EXEC>>>) execution when the user's
        // current message explicitly requests an action. Otherwise strip EXEC blocks so
        // the agent replies as plain text and never self-initiates commits/deploys/OAuth.
        try {
          const __userMsg = String(prompt || '').toLowerCase();
          const __actionWords = ['commit','deploy','push','list repo','list my repo','scrape','inject','create file','edit file','delete','run ','execute','oauth','authorize','pull request','merge','branch','read file','write file','update file'];
          const __wantsAction = __actionWords.some(w => __userMsg.includes(w));
          if (!__wantsAction && typeof text === 'string' && text.indexOf('<<<EXEC>>>') !== -1) {
            const __stripped = text.replace(/<<<EXEC>>>[\s\S]*?<<<END_EXEC>>>/g, '').trim();
            text = __stripped.length > 0 ? __stripped : "I'm here to help. What would you like me to do? (I only run actions like commits, deploys, or repo edits when you explicitly ask.)";
          }
        } catch (__ge) { /* guard is best-effort; never block the response */ }
        // === GUIDELINES RULES ENGINE (code-level enforcement, does not rely on model obedience) ===
        // Parses your admin Guidelines text for directives and enforces them on the AI's output.
        // Supported directive styles (case-insensitive), one per line or sentence:
        //   "never mention X" / "do not mention X" / "don't mention X"
        //   "never <verb> ... unless i ask" / "only <do X> when i ask"
        // Defaults always enforced: never mention repositories / OAuth / deploy unless the user asks.
        try {
          const __userMsg = String(prompt || '').toLowerCase();
          const __g = String(__GUIDELINES_TEXT || '').toLowerCase();

          // 1) Collect "never mention X" topics from the guidelines.
          const __topics = [];
          const __mentionRe = /(?:never|do not|don't|dont)\s+(?:mention|talk about|bring up|reference|say)\s+([a-z0-9 ,/&'-]{2,60})/g;
          let __m;
          while ((__m = __mentionRe.exec(__g)) !== null) {
            // split "a, b and c" style lists into individual words
            __m[1].split(/[,]| and | or |\/|&/).forEach(w => {
              w = w.replace(/\bunless.*$/,'').replace(/\bor repos?\b/,' repo').trim();
              if (w && w.length >= 2 && w.length <= 40) __topics.push(w);
            });
          }
          // Always-on defaults (your standing rules).
          ['repository','repositories','repo','repos','oauth','o auth','deploy','deployment'].forEach(w => __topics.push(w));

          // 2) Build a matcher; a topic is allowed through ONLY if the user's message references it.
          const __esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          const __topicRe = t => new RegExp('\\b' + __esc(t).replace(/\s+/g,'\\s+') + 's?\\b','i');

          if (typeof text === 'string' && __topics.length) {
            const __blocked = __topics.filter(t => {
              const re = __topicRe(t);
              return !re.test(__userMsg); // user did NOT ask about it -> block it
            });
            if (__blocked.length) {
              const __units = text.split(/(?<=[.!?])\s+|\n+/);
              let __clean = __units.filter(u => !__blocked.some(t => __topicRe(t).test(u))).join(' ')
                .replace(/\s{2,}/g,' ').trim();
              if (!__clean) __clean = "I'm here to help. What would you like me to do?";
              text = __clean;
            }
          }
        } catch(__re) { /* best-effort; never block the response */ }
        // === GUIDELINES POSITIVE-RULE HANDLER (guarantees "always say X" phrases at code level) ===
        // Parses "always say X" / "always respond with X" / "when you answer ... say X" /
        //   "end (every) (response/answer) with X" and ensures the phrase appears in every reply.
        try {
          const __gRaw = String(__GUIDELINES_TEXT || '');
          const B = String.fromCharCode(92);
          const S = B + 's+';
          const NB = B + 'b';
          const TAIL = '([^.' + B + 'n]{2,80})';
          const __pats = [
            new RegExp('always say' + S + TAIL, 'ig'),
            new RegExp('always respond with' + S + TAIL, 'ig'),
            new RegExp('(?:when you answer|whenever you answer)[^,]*?' + NB + 'say' + S + TAIL, 'ig'),
            new RegExp('end (?:every |each |your )?(?:response|answer|reply)s? with' + S + TAIL, 'ig')
          ];
          const __phrases = [];
          for (const re of __pats) {
            let mm;
            while ((mm = re.exec(__gRaw)) !== null) {
              let p = mm[1].trim().replace(new RegExp('^["\u2018\u201c]|["\u2019\u201d]$', 'g'), '').trim();
              if (p && p.length >= 2 && p.length <= 80) __phrases.push(p);
            }
          }
          if (typeof text === 'string' && __phrases.length) {
            const __endRe = new RegExp('[.!?]$');
            for (const p of __phrases) {
              if (!text.toLowerCase().includes(p.toLowerCase())) {
                text = text.trim();
                if (text && !__endRe.test(text)) text += '.';
                text = (text ? text + ' ' : '') + p;
              }
            }
          }
        } catch(__pe) { /* best-effort; never block the response */ }



        if (typeof text !== "string") text = String(text || "");

        const { text: cleanText, browserRequest } = extractBrowserBlock(text);

        await upsertCache(supabase, prompt, cleanText);
        saveHistory(supabase, username, prompt, cleanText);

        return J(200, { result: cleanText, browserRequest, provider: "Cloudflare Workers AI" });
    } catch (e) {
        if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
            return J(200, {
                result: `[DOOMSDAY FALLBACK ACTIVATED]\nEdge AI execution failed.\n\nReturning latest scraped data summary:\n\n${keys.LOCAL_SCRAPES[0].text.substring(0, 1000)}...`,
                provider: "Doomsday Local Scraper"
            });
        }
        return J(500, { error: "Cloudflare Workers AI execution failed. " + (e && e.message ? e.message : String(e)) });
    }
}

