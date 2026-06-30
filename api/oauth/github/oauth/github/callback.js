
// Step 2 of real GitHub OAuth — GitHub redirects here after the person
// approves (or denies) access on its own site. This exchanges the one-time
// code for a real access token, then hands a short-lived signed token back
// to the browser so it can store it for the AI to use — the actual access
// token itself never gets shown in the URL or stored client-side in plain
// form; it stays server-side, encrypted, the same pattern used for the
// admin auth check built earlier tonight.

const crypto = require('crypto');

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

function encrypt(plainText, secret) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(String(secret)).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

module.exports = async function handler(req, res) {
    const { code, state, error } = req.query;

    if (error) {
        return res.redirect(`${getBaseUrl(req)}/?oauth_error=github_denied`);
    }

    // Verify the state cookie matches what we set in step 1 — if it
    // doesn't, this request didn't legitimately come from our own
    // authorize step, so we refuse to proceed.
    const cookies = Object.fromEntries((req.headers.cookie || '').split('; ').filter(Boolean).map(c => {
        const idx = c.indexOf('=');
        return [c.slice(0, idx), c.slice(idx + 1)];
    }));
    if (!state || state !== cookies.gh_oauth_state) {
        return res.status(400).send('State mismatch — possible CSRF, or this link expired. Please try connecting again.');
    }

    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    const encryptionSecret = process.env.SERVER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!clientId || !clientSecret) {
        return res.status(500).send('GitHub OAuth is not fully configured on the server yet.');
    }

    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: `${getBaseUrl(req)}/api/oauth/github/callback`
            })
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            return res.redirect(`${getBaseUrl(req)}/?oauth_error=github_token_failed`);
        }

        // Fetch the GitHub username so the front-end can show who's connected
        const userRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' }
        });
        const ghUser = await userRes.json();

        // Encrypt the real token before it ever leaves this server.
        const encryptedToken = encrypt(tokenData.access_token, encryptionSecret);

        // Clear the one-time state cookie, hand the encrypted token + username
        // back via a short redirect the front-end already knows how to read.
        res.setHeader('Set-Cookie', 'gh_oauth_state=; Path=/; HttpOnly; Max-Age=0');
        const params = new URLSearchParams({
            oauth_connected: 'github',
            oauth_username: ghUser.login || '',
            oauth_token_enc: encryptedToken
        });
        res.redirect(`${getBaseUrl(req)}/?${params.toString()}`);
    } catch (e) {
        res.redirect(`${getBaseUrl(req)}/?oauth_error=github_exception`);
    }
};
