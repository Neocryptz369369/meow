
const crypto = require('crypto');

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return proto + '://' + host;
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
    const base = getBaseUrl(req);

    if (error) {
        return res.redirect(base + '/?oauth_error=github_denied');
    }

    const cookieHeader = req.headers.cookie || '';
    const cookies = {};
    cookieHeader.split(';').forEach(function(part) {
        const trimmed = part.trim();
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
            cookies[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
    });

    if (!state || state !== cookies.gh_oauth_state) {
        return res.status(400).send('State mismatch — link may have expired. Please try connecting again.');
    }

    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    const encSecret = process.env.SERVER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!clientId || !clientSecret) {
        return res.status(500).send('GitHub OAuth is not fully configured on the server yet.');
    }

    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: base + '/api/oauth/github/callback'
            })
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            return res.redirect(base + '/?oauth_error=github_token_failed');
        }

        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: 'Bearer ' + tokenData.access_token,
                Accept: 'application/vnd.github+json'
            }
        });
        const ghUser = await userRes.json();

        const encryptedToken = encrypt(tokenData.access_token, encSecret);

        res.setHeader('Set-Cookie', 'gh_oauth_state=; Path=/; HttpOnly; Max-Age=0');

        const params = new URLSearchParams({
            oauth_connected: 'github',
            oauth_username: ghUser.login || '',
            oauth_token_enc: encryptedToken
        });

        res.redirect(base + '/?' + params.toString());

    } catch (e) {
        res.redirect(base + '/?oauth_error=github_exception');
    }
};
