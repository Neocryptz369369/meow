const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const country = req.headers['x-vercel-ip-country'];
    const region = req.headers['x-vercel-ip-country-region'];
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (country && country !== 'US') {
        return res.status(403).json({ error: "ACCESS DENIED: Neocryptz AI is currently restricted to US residents only." });
    }
    if (region && region === 'CA') {
        return res.status(403).json({ error: "ACCESS DENIED: Due to state regulations, Neocryptz AI is not available in California." });
    }

    try {
        const geoRes = await fetch(`https://freeipapi.com/api/json/${ip}`);
        const geoData = await geoRes.json();
        if (geoData && geoData.isProxy) {
            return res.status(403).json({ error: "SECURITY ALERT: VPN or Proxy detected. Please disable your VPN to access Neocryptz AI." });
        }
    } catch (e) {
        console.error("Server-side geo-check failed:", e);
    }

    const { prompt, keys, history, username } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

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

    function saveHistory(supabase, uname, user_msg, ai_response) {
        if (!supabase || !uname || uname === 'Unknown') return;
        supabase.from('chat_history')
            .insert([{ username: uname, user_msg, ai_response }])
            .then(() => {}).catch(() => {});
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
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
                return res.status(200).json({ result: data.response, provider: "System Cache (Zero-Cost)" });
            }
        } catch(e) { console.log("Cache lookup skipped."); }
    }

    let providerOrder = keys && keys.PROVIDER_ORDER
        ? keys.PROVIDER_ORDER.split(',').map(p => p.trim().toLowerCase())
        : ['gemini', 'pollinations', 'sambanova', 'openrouter'];

    const systemKeys = {
        'GOOGLE_API_KEY':      process.env.GOOGLE_API_KEY      || "",
        'OPENROUTER_API_KEY':  process.env.OPENROUTER_API_KEY  || "",
        'POLLINATIONS_API_KEY':process.env.POLLINATIONS_API_KEY|| "",
        'SAMBANOVA_API_KEY':   process.env.SAMBANOVA_API_KEY   || "",
        'GROQ_API_KEY':        process.env.GROQ_API_KEY        || "",
        'GITHUB_TOKEN':        process.env.GITHUB_TOKEN        || "",
        'VERCEL_TOKEN':        process.env.VERCEL_TOKEN        || ""
    };

    const activeKeys = { ...systemKeys, ...(keys || {}) };
    let lastError = "";

    let systemPrompt = `You are Neocryptz AI, an extremely skilled software engineer. You are resourceful and execute tasks autonomously without asking multiple questions. Your name is Neocryptz. You must strictly refuse to generate, reproduce, or distribute any copyrighted material.

EXECUTION ENGINE — YOU HAVE REAL GITHUB PUSH CAPABILITY:
When the user asks you to change a website, add a feature, fix a bug, or deploy anything, you MUST output an execution block. The system will actually run it and push the changes to GitHub. Vercel auto-deploys after every push.

OUTPUT FORMAT — wrap your action in exactly these delimiters:
<<<EXEC>>>
{"action":"ACTION_NAME", ...params}
<<<END_EXEC>>>

AVAILABLE ACTIONS:
1. list_repos — {"action":"list_repos"}
2. read_file_excerpt — {"action":"read_file_excerpt","repo":"Neocryptz369369/REPO","path":"index.html"}
3. inject_html — {"action":"inject_html","repo":"Neocryptz369369/REPO","path":"index.html","inject":"<div>...</div>","position":"before_closing_body","message":"commit message"}
   positions: before_closing_body | before_closing_head | after_opening_body
4. patch_file — {"action":"patch_file","repo":"Neocryptz369369/REPO","path":"index.html","find":"EXACT STRING TO FIND","replace":"NEW STRING","message":"commit message"}
5. push_file — {"action":"push_file","repo":"Neocryptz369369/REPO","path":"filename.ext","content":"full content","message":"commit message"}

RULES:
- The GitHub owner is always "Neocryptz369369"
- For adding UI elements: use inject_html with position before_closing_body
- For adding CSS: inject a <style> block using inject_html with position before_closing_head
- For editing existing elements: use patch_file
- NEVER use push_file on large HTML files

BROWSER AUTOMATION:
When the user asks you to visit a website, output a <<<BROWSER_PERMISSION>>> block:
<<<BROWSER_PERMISSION>>>
{"url":"https://FULL-URL-HERE.com","description":"What you are doing","actions":[
  {"type":"screenshot","label":"Opening the page"},
  {"type":"scroll","y":600,"label":"Scrolling to see more"},
  {"type":"screenshot","label":"Full view"}
]}
<<<END_BROWSER_PERMISSION>>>

SECRET KEYS VAULT:
If a user asks where to put an API key, tell them:
1. Click the gear icon top-right
2. Click SETTINGS / OAUTH
3. Scroll to MY SECRET KEYS VAULT
4. Enter a label and paste the key
5. Click SAVE`;

    if (keys && keys.ACTIVE_PERSONA) {
        if (keys.ACTIVE_PERSONA === 'seo') systemPrompt = "You are Neocryptz AI. You are a highly-paid SEO Keyword expert. You provide ultra-short, highly-optimized keywords and SEO metadata.";
        if (keys.ACTIVE_PERSONA === 'code') systemPrompt = "You are Neocryptz AI. You are a Senior Principal Software Engineer. Find the bug in the user's code and provide a clean, secure fix.";
        if (keys.ACTIVE_PERSONA === 'copywriter') systemPrompt = "You are Neocryptz AI. You are an elite, persuasive copywriter. Write highly engaging, conversion-focused advertising copy.";
        if (keys.ACTIVE_PERSONA === 'sarcastic') systemPrompt = "You are Neocryptz AI. You are incredibly sarcastic, witty, and slightly condescending, but still ultimately helpful.";
        if (keys.ACTIVE_PERSONA === 'json') systemPrompt = "You are Neocryptz AI. You must ONLY output raw, valid JSON. Do not include any conversational text or markdown wrappers.";
    }

    const authorizedPlatforms = Object.keys(keys || {}).filter(k => k.startsWith("AUTH_TOKEN_")).map(k => k.replace("AUTH_TOKEN_", ""));
    if (authorizedPlatforms.length > 0) {
        systemPrompt += "\n\nThe user has authorized you for: " + authorizedPlatforms.join(", ") + ". You have access to their authentication tokens via the environment keys.";
    }

    if (keys && keys.TARGET_LANGUAGE) {
        systemPrompt = "CRITICAL DIRECTIVE: YOU MUST TRANSLATE YOUR ENTIRE RESPONSE INTO " + keys.TARGET_LANGUAGE.toUpperCase() + ". DO NOT USE ENGLISH. " + systemPrompt;
    }
    if (keys && keys.BASE_GUIDELINES) {
        systemPrompt += "\n\nCOMPANY BRAND GUIDELINES:\n" + keys.BASE_GUIDELINES;
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

    function extractBrowserBlock(text) {
        const m = text.match(/<<<BROWSER_PERMISSION>>>([\s\S]*?)<<<END_BROWSER_PERMISSION/);
        if (!m) return { text, browserRequest: null };
        let req = null;
        try {
            let raw = m[1].trim();
            const lastBrace = raw.lastIndexOf('}');
            if (lastBrace !== -1) raw = raw.substring(0, lastBrace + 1);
            req = JSON.parse(raw);
        } catch(e) { req = null; }
        const cleanText = text.replace(/<<<BROWSER_PERMISSION>>>[\s\S]*?(<<<END_BROWSER_PERMISSION[^\n]*|$)/g, '').trim();
        return { text: cleanText, browserRequest: req };
    }

    // Some providers (Pollinations included, depending on which model it
    // routes to) return a JSON object with separate "reasoning" and
    // "tool_calls" fields instead of plain text with an <<<EXEC>>> block.
    // Without this, that raw JSON — including the model's private internal
    // reasoning — was being shown to the user verbatim as if it were the
    // actual reply. This converts that shape into the same <<<EXEC>>> text
    // format the rest of this file (and the front-end pipeline) already
    // knows how to handle, so it goes through the normal flow instead.
    // Pollinations' free tier occasionally appends (or, on a bad response,
    // returns ONLY) a "support us" sponsor blurb — a markdown block
    // mentioning "Support Pollinations.AI" and a kofi/redirect link. This
    // strips that out of any response before it's shown or processed, and
    // flags it separately if a response turns out to be nothing else.
    function stripPollinationsAd(rawText) {
        const text = rawText || '';
        const adPattern = /-{2,}\s*\n*\s*\*{0,2}Support Pollinations\.AI:?\*{0,2}[\s\S]*?pollinations\.ai\/redirect\/kofi[\s\S]*?(?:\.|accessible for everyone\.?)/gi;
        const stripped = text.replace(adPattern, '').replace(/^-{2,}\s*$/gm, '').trim();
        return { text: stripped, wasAdOnly: stripped.length === 0 && text.length > 0 };
    }

    function normalizeProviderText(rawText) {
        const trimmed = (rawText || '').trim();
        if (!trimmed.startsWith('{')) return rawText;

        let parsed;
        try { parsed = JSON.parse(trimmed); } catch (e) { return rawText; }
        if (!parsed || !Array.isArray(parsed.tool_calls) || !parsed.tool_calls.length) return rawText;

        const call = parsed.tool_calls[0];
        const fn = call && call.function;
        if (!fn || !fn.name) return rawText;

        let args = fn.arguments;
        if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch (e) { args = {}; }
        }
        if (!args || typeof args !== 'object') args = {};

        // The model's own tool name may not exactly match an action name
        // (e.g. "EXEC" itself, or a slightly different label) — pull the
        // real action out of args.action if present, otherwise fall back
        // to the function name.
        const action = args.action || fn.name;
        const execPayload = JSON.stringify({ ...args, action });

        return `<<<EXEC>>>\n${execPayload}\n<<<END_EXEC>>>`;
    }

    // ── Detecting "claimed to act but actually didn't" ──────────────────────
    // Some providers (Pollinations especially) will sometimes ignore the
    // instruction to output a real <<<EXEC>>> block and instead just write a
    // friendly sentence claiming the action was done. That's worse than an
    // error, since it looks like success. If the user's message clearly
    // asks for a real action and the response has neither a real EXEC block
    // nor a browser-permission block, we treat that provider as having
    // failed this request and fall through to the next one in the waterfall
    // — the same way a network error already does — rather than returning
    // text that falsely claims something happened.
    function looksLikeActionRequest(text) {
        const lower = (text || '').toLowerCase();
        return /\b(push|deploy|create a file|make a file|add a file|commit|repo(sitory)?|patch|inject|update (the )?(site|page|file)|github|go to|visit|browse|press|click|navigate)\b/.test(lower);
    }

    // The set of actions api/execute.js actually understands. A response
    // that contains an <<<EXEC>>> block isn't automatically "real" — the
    // model can (and sometimes does) make up an action name that doesn't
    // exist, like "EXECUTIVE_BROWSE" instead of the real browser-permission
    // format. Before, any EXEC block at all counted as a real action, which
    // let a hallucinated, unusable action slip all the way through to
    // execute.js — which correctly rejected it as "Unknown action", but
    // only after the user had already seen a pipeline panel claiming
    // something real was happening. This checks the action name itself, so
    // a fake one is treated as a failure and falls through to the next
    // provider in the waterfall, same as a network error would.
    const KNOWN_EXEC_ACTIONS = ['list_repos', 'read_file_excerpt', 'inject_html', 'patch_file', 'push_file'];
    function hasRealAction(text) {
        const execMatch = (text || '').match(/<<<EXEC>>>([\s\S]*?)<<<END_EXEC>>+/);
        if (execMatch) {
            try {
                const parsed = JSON.parse(execMatch[1].trim());
                return KNOWN_EXEC_ACTIONS.includes(parsed.action);
            } catch (e) {
                return false; // malformed JSON inside the block — not a real action either
            }
        }
        return /<<<BROWSER_PERMISSION>>>/.test(text || '');
    }

    for (const provider of providerOrder) {
        try {
            // 1. Pollinations (no key required — first in waterfall)
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
                    text = normalizeProviderText(text);
                    const { text: adStrippedText, wasAdOnly } = stripPollinationsAd(text);
                    text = adStrippedText;
                    if (wasAdOnly || (looksLikeActionRequest(prompt) && !hasRealAction(text))) {
                        lastError += wasAdOnly
                            ? "Pollinations returned only its sponsor blurb, no real content | "
                            : "Pollinations claimed action without a real EXEC block | ";
                    } else {
                        const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                        await upsertCache(supabase, prompt, cleanText);
                        saveHistory(supabase, username, prompt, cleanText);
                        return res.status(200).json({ result: cleanText, browserRequest, provider: "Pollinations" });
                    }
                } else {
                    lastError += "Pollinations Error: " + polRes.statusText + " | ";
                }
            }

            // 2. SambaNova
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
                    if (data.choices?.[0]?.message) {
                        let text = data.choices[0].message.content;
                        text = normalizeProviderText(text);
                        if (looksLikeActionRequest(prompt) && !hasRealAction(text)) {
                            lastError += "SambaNova claimed action without a real EXEC block | ";
                        } else {
                            const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                            await upsertCache(supabase, prompt, cleanText);
                            saveHistory(supabase, username, prompt, cleanText);
                            return res.status(200).json({ result: cleanText, browserRequest, provider: "SambaNova" });
                        }
                    }
                } else {
                    lastError += "SambaNova Error: " + sambaRes.statusText + " | ";
                }
            }

            // 3. Google Gemini
            if (provider === 'gemini' && activeKeys.GOOGLE_API_KEY) {
                const contents = [{ role: "user", parts: [{ text: systemPrompt }] }];
                formattedHistory.forEach(h => contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] }));
                contents.push({ role: "user", parts: [{ text: prompt }] });
                const resGemini = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${activeKeys.GOOGLE_API_KEY}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) }
                );
                if (resGemini.ok) {
                    const data = await resGemini.json();
                    if (data.candidates?.[0]?.content?.parts?.[0]) {
                        let text = data.candidates[0].content.parts[0].text;
                        text = normalizeProviderText(text);
                        if (looksLikeActionRequest(prompt) && !hasRealAction(text)) {
                            lastError += "Gemini claimed action without a real EXEC block | ";
                        } else {
                            const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                            await upsertCache(supabase, prompt, cleanText);
                            saveHistory(supabase, username, prompt, cleanText);
                            return res.status(200).json({ result: cleanText, browserRequest, provider: "Gemini" });
                        }
                    }
                } else {
                    lastError += "Gemini Error: " + resGemini.statusText + " | ";
                }
            }

            // 4. OpenRouter
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
                    if (data.choices?.[0]?.message) {
                        let text = data.choices[0].message.content;
                        text = normalizeProviderText(text);
                        if (looksLikeActionRequest(prompt) && !hasRealAction(text)) {
                            lastError += "OpenRouter claimed action without a real EXEC block | ";
                        } else {
                            const { text: cleanText, browserRequest } = extractBrowserBlock(text);
                            await upsertCache(supabase, prompt, cleanText);
                            saveHistory(supabase, username, prompt, cleanText);
                            return res.status(200).json({ result: cleanText, browserRequest, provider: "OpenRouter" });
                        }
                    }
                } else {
                    lastError += "OpenRouter Error: " + orRes.statusText + " | ";
                }
            }

        } catch (e) {
            lastError += `${provider} Network Error | `;
        }
    }

    // Doomsday Fallback
    if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
        return res.status(200).json({
            result: `[DOOMSDAY FALLBACK ACTIVATED]\nAll external AI endpoints failed.\n\nReturning latest scraped data summary:\n\n${keys.LOCAL_SCRAPES[0].text.substring(0, 1000)}...`,
            provider: "Doomsday Local Scraper"
        });
    }

    if (looksLikeActionRequest(prompt)) {
        return res.status(200).json({
            result: "I wasn't able to generate a real action for this request through any available AI provider — nothing was pushed or changed. You can try rephrasing the request, or try again in a moment.",
            provider: "None (action generation failed)"
        });
    }

    return res.status(500).json({ error: "All AI providers in the waterfall failed. " + lastError });
}
