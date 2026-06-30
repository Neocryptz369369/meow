const crypto = require('crypto');

module.exports = async function handler(req, res) {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) {
        return res.status(500).send('GITHUB_OAUTH_CLIENT_ID is not set in Vercel environment variables yet.');
    }

    const state = crypto.randomBytes(16).toString('hex');

    res.setHeader('Set-Cookie', 'gh_oauth_state=' + state + '; Path=/; HttpOnly; Max-Age=600; SameSite=Lax');

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = proto + '://' + host;
    const redirectUri = baseUrl + '/api/oauth/github/callback';

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user repo',
        state: state
    });

    res.redirect('https://github.com/login/oauth/authorize?' + params.toString());
};
