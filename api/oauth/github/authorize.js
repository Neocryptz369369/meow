/ Step 1 of real GitHub OAuth — sends the user to GitHub's own login page.
// Nothing fake here: this is the actual github.com authorize screen, not a
// simulated one. The person logs in (or is already logged in), GitHub asks
// if they want to grant this app access, and only then does it redirect
// back to our callback with a real, one-time-use code.

module.exports = async function handler(req, res) {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) {
        return res.status(500).send('GITHUB_OAUTH_CLIENT_ID is not set in Vercel environment variables yet.');
    }

    // state is a random value we can verify on the way back, so a malicious
    // site can't trick someone into authorizing without their knowledge
    // (a basic CSRF protection standard to OAuth flows).
    const state = require('crypto').randomBytes(16).toString('hex');

    // Stored in a short-lived cookie so /callback can verify it matches —
    // simpler than a database for a single round-trip value like this.
    res.setHeader('Set-Cookie', `gh_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`);

    const redirectUri = `${getBaseUrl(req)}/api/oauth/github/callback`;
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user repo', // matches what your existing GitHub push features need
        state
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}
