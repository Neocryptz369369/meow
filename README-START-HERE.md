# Start here (redeploy trigger) 2 3 4 5

This is everything I've actually built or fixed across our conversation,
already arranged into the folders your new repo needs. It is NOT your whole
project — you still need to add some files yourself, listed below.

**A note on `vercel.json`:** I trimmed out the `functions` block (the part that
gave extra run time to `chat.js`, `browser.js`, etc.) because Vercel refuses to
deploy at all if it references files that don't exist yet — and right now,
those files aren't in this repo. Once you've added the other `api/*.js` files
listed below, add this block back into `vercel.json`, right alongside the
existing `"headers"` section:

```json
"functions": {
  "api/browser-session.js": { "maxDuration": 15 },
  "api/browser-run.js":     { "maxDuration": 90 },
  "api/browser.js":         { "maxDuration": 30 },
  "api/chat.js":            { "maxDuration": 30 },
  "api/execute.js":         { "maxDuration": 30 },
  "api/stripe-webhook.js":  { "maxDuration": 15 },
  "api/purchase-poll.js":   { "maxDuration": 10 }
}
```

## ✅ Included in this zip (ready to use as-is)

```
index.html        ← chat redesign, TikTok ad boxes, admin auth fix, password change
crypt.png          ← your new logo
vercel.json         ← unchanged from what you already had
package.json         ← the one you uploaded earlier — see caveat below
lib/
  verifyAdmin.js     ← checks a real Supabase admin session before any admin action runs
api/
  admin/
    tiktok.js          ← lets you add/edit/delete TikTok ads (the 404 fix)
    users.js           ← user registry, now gated behind a real login check
```

**One caveat in `package.json`:** its `scripts` section still says `"start": "node agent.js"`,
left over from before — and `agent.js` is one of the files we're deliberately
not bringing into this new repo (see below). That only matters if you ever
run `npm start` locally; Vercel itself doesn't use this field to deploy, so
it won't break your actual live site. Update or remove it whenever's
convenient. I kept all the listed dependencies exactly as you had them,
since some of your other `api/` files I haven't seen may still need them.

## 🧩 You still need to bring these yourself

I never received these files, so I genuinely can't hand them back to you —
pull them from wherever your project currently lives:

- `package-lock.json` or `yarn.lock`
- Everything else under `api/` that isn't in the `admin/` folder above:
  `chat.js`, `reward.js`, `history.js`, `migrate.js`, `execute.js`,
  `deploy-status.js`, `browser.js`, `browser-run.js`, `browser-session.js`,
  `image/generate.js`, `recommendations/active.js`, `recommendations/go.js`

One thing to double check once you have those: make sure `@supabase/supabase-js`
covers what they need — it's already in `package.json` above.

## 🚫 Leave these out on purpose

- `admin-login.html` — still has the old hardcoded password in it. Bringing
  it over would quietly recreate the exact hole we just closed.
- `fix_keys3.js` — this is the file with the exposed API key fragments.
- `get-pip.py` — not a real file, just a saved error page.
- `agent.js`, `agent.py`, `actions.js` — only bring these if you've decided
  you're okay with rewriting the "act without asking the user" instructions
  in them first.

## Before this actually works — Supabase + environment variables

1. In Supabase: **Authentication → Users** — make sure `neocryptz@neocryptz.ai`
   exists with a brand new password (not the old leaked one).
2. In Vercel: **Project → Settings → Environment Variables** — set
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_EMAILS`
   (comma-separated if more than one admin).
3. Rotate the four API keys that were in `fix_keys3.js` (Google, OpenRouter,
   Groq, Pollinations) at each provider's own dashboard — a new repo doesn't
   undo a key that already leaked.
4. Whenever you're ready, not urgent today: a Row Level Security policy on
   the `support_messages` table in Supabase, as a second layer of protection
   on top of what `users.js` already does.
.
