export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  const cf = request.cf || {};
  const country = cf.country;
  const region = cf.regionCode;
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

  if (country && country !== 'US') {
    return Response.json({ error: 'ACCESS DENIED: Neocryptz AI is currently restricted to US residents only.' }, { status: 403 });
  }
  if (region && region === 'CA') {
    return Response.json({ error: 'ACCESS DENIED: Due to state regulations, Neocryptz AI is not available in California.' }, { status: 403 });
  }

  try {
    const geoRes = await fetch(`https://freeipapi.com/api/json/${ip}`);
    const geoData = await geoRes.json();
    if (geoData && geoData.isProxy) {
      return Response.json({ error: 'SECURITY ALERT: VPN or Proxy detected. Please disable your VPN to access Neocryptz AI.' }, { status: 403 });
    }
  } catch (e) {
    console.error('Server-side geo-check failed:', e);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, keys, history, username } = body || {};
  if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400 });

  const gratitudeMatch = prompt.trim().toLowerCase().match(/^(thank(s| you)?( so much| a lot| very much)?|thx|ty|appreciate it|much appreciated)[\s!.,]*$/);
  if (gratitudeMatch) {
    const replies = [
      "You're welcome!",
      "You're very welcome — happy to help.",
      'Anytime!',
      "You're welcome! Let me know if you need anything else."
    ];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    return Response.json({ result: reply, provider: 'Instant (no AI call needed)' });
  }

  function sbHeaders(supabaseKey) {
    return {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function upsertCache(supabaseUrl, supabaseKey, promptText, responseText) {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      await fetch(`${supabaseUrl}/rest/v1/query_cache?on_conflict=prompt`, {
        method: 'POST',
        headers: { ...sbHeaders(supabaseKey), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{ prompt: promptText.trim(), response: responseText }])
      });
    } catch (e) {
      console.error('Cache upsert failed:', e.message);
    }
  }

  function saveHistory(supabaseUrl, supabaseKey, uname, user_msg, ai_response) {
    if (!supabaseUrl || !supabaseKey || !uname || uname === 'Unknown') return;
    fetch(`${supabaseUrl}/rest/v1/chat_history`, {
      method: 'POST',
      headers: sbHeaders(supabaseKey),
      body: JSON.stringify([{ username: uname, user_msg, ai_response }])
    }).then(() => {}).catch(() => {});
  }

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.neocryptz_final_anon;

  if (supabaseKey) {
    try {
      const cacheRes = await fetch(`${supabaseUrl}/rest/v1/query_cache?prompt=eq.${encodeURIComponent(prompt.trim())}&select=response`, {
        headers: sbHeaders(supabaseKey)
      });
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows && rows[0] && rows[0].response) {
          return Response.json({ result: rows[0].response, provider: 'System Cache (Zero-Cost)' });
        }
      }
    } catch (e) {
      console.log('Cache lookup skipped.');
    }
  }

  const providerOrder = keys && keys.PROVIDER_ORDER
    ? keys.PROVIDER_ORDER.split(',').map(p => p.trim().toLowerCase())
    : ['openrouter', 'gemini', 'sambanova', 'pollinations'];

  const systemKeys = {
    GOOGLE_API_KEY: env.GOOGLE_API_KEY || '',
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
    POLLINATIONS_API_KEY: env.POLLINATIONS_API_KEY || '',
    SAMBANOVA_API_KEY: env.SAMBANOVA_API_KEY || '',
    GROQ_API_KEY: env.GROQ_API_KEY || '',
    GITHUB_TOKEN: env.GITHUB_TOKEN || ''
  };

  const activeKeys = { ...systemKeys, ...(keys || {}) };
  let lastError = '';
  const isAdmin = ['neocryptz', 'admin'].includes((username || '').toLowerCase());

  let systemPrompt = `You are Neocryptz AI, an extremely skilled software engineer and ReAct coding assistant. Use an internal ReAct loop: observe the task, plan the smallest safe step, act, verify, and repeat until the task is complete. Keep reasoning private. Your name is Neocryptz. You must strictly refuse to generate, reproduce, or distribute any copyrighted material.

REACT BRAIN — FOR ALL USERS:
- Read relevant files or context before suggesting or making changes.
- Prefer the smallest safe edit.
- Verify the result after any change.
- Stay concise and action-oriented.
- When asked to code, provide working code or take the approved action.`;

  if (isAdmin) {
    systemPrompt += `

EXECUTION ENGINE — YOU HAVE REAL GITHUB PUSH CAPABILITY:
When the user asks you to change a website, add a feature, fix a bug, or deploy anything, you MUST output an execution block. The system will actually run it and push the changes to GitHub. Cloudflare auto-deploys after every push.

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
6. create_branch — {"action":"create_branch","repo":"Neocryptz369369/REPO","branch":"react-brain","base_branch":"main"}
7. list_branches — {"action":"list_branches","repo":"Neocryptz369369/REPO"}
8. list_pull_requests — {"action":"list_pull_requests","repo":"Neocryptz369369/REPO","state":"open"}
9. create_pull_request — {"action":"create_pull_request","repo":"Neocryptz369369/REPO","title":"...","head":"react-brain","base":"main","draft":true}
10. redeploy — {"action":"redeploy"} - triggers a fresh Cloudflare Pages deployment of the current commit, with no file changes. Use this when the user asks you to redeploy or restart the deployment without changing any code.

RULES:
- The GitHub owner is always "Neocryptz369369"
- For adding UI elements: use inject_html with position before_closing_body
- For adding CSS: inject a <style> block using inject_html with position before_closing_head
- For editing existing elements: inspect first, then patch or push on a branch
- Prefer a branch plus draft PR after verification unless the user explicitly requests direct push
- NEVER use push_file on large HTML files`;
  } else {
    systemPrompt += `

NON-ADMIN MODE:
You still think like a ReAct coding assistant and can help draft code, plans, and explanations, but do not claim to have changed GitHub unless the backend actually did it.`;
  }

  systemPrompt += `

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
5. Click SAVE

CONVERSATIONAL MESSAGES:
Not every message is a task. If the user sends something short and conversational — "thank you", "thanks", "ok", "cool", "nice", a greeting, or similar — just respond naturally and warmly, like a normal reply in conversation. Do not treat it as a request that needs an action, and do not say you "can't help with that" — there's nothing being asked that needs help; a simple acknowledgment is enough.`;

  if (keys && keys.ACTIVE_PERSONA) {
    if (keys.ACTIVE_PERSONA === 'seo') systemPrompt = 'You are Neocryptz AI. You are a highly-paid SEO Keyword expert. You provide ultra-short, highly-optimized keywords and SEO metadata.';
    if (keys.ACTIVE_PERSONA === 'code') systemPrompt = "You are Neocryptz AI. You are a Senior Principal Software Engineer. Find the bug in the user's code and provide a clean, secure fix.";
    if (keys.ACTIVE_PERSONA === 'copywriter') systemPrompt = 'You are Neocryptz AI. You are an elite, persuasive copywriter. Write highly engaging, conversion-focused advertising copy.';
    if (keys.ACTIVE_PERSONA === 'sarcastic') systemPrompt = 'You are Neocryptz AI. You are incredibly sarcastic, witty, and slightly condescending, but still ultimately helpful.';
    if (keys.ACTIVE_PERSONA === 'json') systemPrompt = 'You are Neocryptz AI. You must ONLY output raw, valid JSON. Do not include any conversational text or markdown wrappers.';
  }

  const authorizedPlatforms = Object.keys(keys || {}).filter(k => k.startsWith('AUTH_TOKEN_')).map(k => k.replace('AUTH_TOKEN_', ''));
  if (authorizedPlatforms.length > 0) {
    systemPrompt += '\n\nThe user has authorized you for: ' + authorizedPlatforms.join(', ') + '. You have access to their authentication tokens via the environment keys.';
  }

  if (keys && keys.TARGET_LANGUAGE) {
    systemPrompt = 'CRITICAL DIRECTIVE: YOU MUST TRANSLATE YOUR ENTIRE RESPONSE INTO ' + keys.TARGET_LANGUAGE.toUpperCase() + '. DO NOT USE ENGLISH. ' + systemPrompt;
  }
  if (keys && keys.BASE_GUIDELINES) {
    systemPrompt += '\n\nCOMPANY BRAND GUIDELINES:\n' + keys.BASE_GUIDELINES;
  }
  if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
    systemPrompt += '\n\nCRITICAL CONTEXT FROM SYSTEM SCRAPER:\n';
    keys.LOCAL_SCRAPES.forEach(s => {
      systemPrompt += `\n[Source: ${s.url}]\n${s.text.substring(0, 500)}...\n`;
    });
  }

  const formattedHistory = [];
  if (history && history.length > 0) {
    history.forEach(h => {
      formattedHistory.push({ role: 'user', content: h.user_msg });
      formattedHistory.push({ role: 'assistant', content: h.ai_response });
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
    } catch (e) {
      req = null;
    }
    const cleanText = text.replace(/<<<BROWSER_PERMISSION>>>[\s\S]*?(<<<END_BROWSER_PERMISSION[^\n]*|$)/g, '').trim();
    return { text: cleanText, browserRequest: req };
  }

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
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return rawText;
    }
    if (!parsed || !Array.isArray(parsed.tool_calls) || !parsed.tool_calls.length) return rawText;
    const call = parsed.tool_calls[0];
    const fn = call && call.function;
    if (!fn || !fn.name) return rawText;
    let args = fn.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { args = {}; }
    }
    if (!args || typeof args !== 'object') args = {};
    const action = args.action || fn.name;
    const execPayload = JSON.stringify({ ...args, action });
    return `<<<EXEC>>>\n${execPayload}\n<<<END_EXEC>>>`;
  }

  function looksLikeActionRequest(text) {
    const lower = (text || '').toLowerCase();
    return /\b(redeploy|push|deploy|create a file|make a file|add a file|commit|repo(sitory)?|branch|pull request|pr|patch|inject|update (the )?(site|page|file)|github|go to|visit|browse|press|click|navigate)\b/.test(lower);
  }

  const KNOWN_EXEC_ACTIONS = ['list_repos', 'read_file_excerpt', 'list_branches', 'list_pull_requests', 'create_branch', 'inject_html', 'patch_file', 'push_file', 'create_pull_request', 'redeploy'];

  function hasRealAction(text) {
    const execMatch = (text || '').match(/<<<EXEC>>>([\s\S]*?)<<<END_EXEC>>+/);
    if (execMatch) {
      try {
        const parsed = JSON.parse(execMatch[1].trim());
        return KNOWN_EXEC_ACTIONS.includes(parsed.action);
      } catch (e) {
        return false;
      }
    }
    return /<<<BROWSER_PERMISSION>>>/.test(text || '');
  }

  function isFakeAuthClaim(text) {
    const hasAuthClaim = /\b(authorized!?|access granted|now has access to)\b/i.test(text || '');
    return hasAuthClaim && !hasRealAction(text);
  }

  for (const provider of providerOrder) {
    try {
      if (provider === 'openrouter' && activeKeys.OPENROUTER_API_KEY) {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeKeys.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, ...formattedHistory, { role: 'user', content: prompt }]
          })
        });
        if (orRes.ok) {
          const data = await orRes.json();
          if (data.choices?.[0]?.message) {
            let text = data.choices[0].message.content;
            text = normalizeProviderText(text);
            if (isFakeAuthClaim(text) || (looksLikeActionRequest(prompt) && !hasRealAction(text))) {
              lastError += 'OpenRouter claimed action without a real EXEC block | ';
            } else {
              const { text: cleanText, browserRequest } = extractBrowserBlock(text);
              await upsertCache(supabaseUrl, supabaseKey, prompt, cleanText);
              saveHistory(supabaseUrl, supabaseKey, username, prompt, cleanText);
              return Response.json({ result: cleanText, browserRequest, provider: 'OpenRouter' });
            }
          }
        } else {
          lastError += 'OpenRouter Error: ' + orRes.statusText + ' | ';
        }
      }

      if (provider === 'gemini' && activeKeys.GOOGLE_API_KEY) {
        const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];
        formattedHistory.forEach(h => contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] }));
        contents.push({ role: 'user', parts: [{ text: prompt }] });
        const resGemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${activeKeys.GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        });
        if (resGemini.ok) {
          const data = await resGemini.json();
          if (data.candidates?.[0]?.content?.parts?.[0]) {
            let text = data.candidates[0].content.parts[0].text;
            text = normalizeProviderText(text);
            if (isFakeAuthClaim(text) || (looksLikeActionRequest(prompt) && !hasRealAction(text))) {
              lastError += 'Gemini claimed action without a real EXEC block | ';
            } else {
              const { text: cleanText, browserRequest } = extractBrowserBlock(text);
              await upsertCache(supabaseUrl, supabaseKey, prompt, cleanText);
              saveHistory(supabaseUrl, supabaseKey, username, prompt, cleanText);
              return Response.json({ result: cleanText, browserRequest, provider: 'Gemini' });
            }
          }
        } else {
          lastError += 'Gemini Error: ' + resGemini.statusText + ' | ';
        }
      }

      if (provider === 'sambanova' && activeKeys.SAMBANOVA_API_KEY) {
        const sambaRes = await fetch('https://api.sambanova.ai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeKeys.SAMBANOVA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'Meta-Llama-3.3-70B-Instruct',
            messages: [{ role: 'system', content: systemPrompt }, ...formattedHistory, { role: 'user', content: prompt }]
          })
        });
        if (sambaRes.ok) {
          const data = await sambaRes.json();
          if (data.choices?.[0]?.message) {
            let text = data.choices[0].message.content;
            text = normalizeProviderText(text);
            if (isFakeAuthClaim(text) || (looksLikeActionRequest(prompt) && !hasRealAction(text))) {
              lastError += 'SambaNova claimed action without a real EXEC block | ';
            } else {
              const { text: cleanText, browserRequest } = extractBrowserBlock(text);
              await upsertCache(supabaseUrl, supabaseKey, prompt, cleanText);
              saveHistory(supabaseUrl, supabaseKey, username, prompt, cleanText);
              return Response.json({ result: cleanText, browserRequest, provider: 'SambaNova' });
            }
          }
        } else {
          lastError += 'SambaNova Error: ' + sambaRes.statusText + ' | ';
        }
      }

      if (provider === 'pollinations') {
        const polRes = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'system', content: systemPrompt }, ...formattedHistory, { role: 'user', content: prompt }]
          })
        });
        if (polRes.ok) {
          let text = await polRes.text();
          text = normalizeProviderText(text);
          const { text: adStrippedText, wasAdOnly } = stripPollinationsAd(text);
          text = adStrippedText;
          if (wasAdOnly || isFakeAuthClaim(text) || (looksLikeActionRequest(prompt) && !hasRealAction(text))) {
            lastError += wasAdOnly
              ? 'Pollinations returned only its sponsor blurb, no real content | '
              : 'Pollinations claimed action without a real EXEC block | ';
          } else {
            const { text: cleanText, browserRequest } = extractBrowserBlock(text);
            await upsertCache(supabaseUrl, supabaseKey, prompt, cleanText);
            saveHistory(supabaseUrl, supabaseKey, username, prompt, cleanText);
            return Response.json({ result: cleanText, browserRequest, provider: 'Pollinations' });
          }
        } else {
          lastError += 'Pollinations Error: ' + polRes.statusText + ' | ';
        }
      }
    } catch (e) {
      lastError += `${provider} Network Error | `;
    }
  }

  if (keys && keys.LOCAL_SCRAPES && keys.LOCAL_SCRAPES.length > 0) {
    return Response.json({
      result: `[DOOMSDAY FALLBACK ACTIVATED]\nAll external AI endpoints failed.\n\nReturning latest scraped data summary:\n\n${keys.LOCAL_SCRAPES[0].text.substring(0, 1000)}...`,
      provider: 'Doomsday Local Scraper'
    });
  }

  if (looksLikeActionRequest(prompt)) {
    return Response.json({
      result: "I wasn't able to generate a real action for this request through any available AI provider — nothing was pushed or changed. You can try rephrasing the request, or try again in a moment.",
      provider: 'None (action generation failed)'
    });
  }

  return Response.json({ error: 'All AI providers in the waterfall failed. ' + lastError }, { status: 500 });
}
