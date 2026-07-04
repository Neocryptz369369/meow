// GitHub OAuth — Step 1: redirect to GitHub consent screen

export async function onRequestGet(context) {
    const request = context.request;
    const env = context.env;
    const clientId = env.GH_OAUTH_CLIENT_ID;

  if (!clientId) {
        return new Response('GH_OAUTH_CLIENT_ID is not configured.', { status: 500 });
  }

  const stateBytes = crypto.getRandomValues(new Uint8Array(16));
    const state = Array.from(stateBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const url = new URL(request.url);
    const baseUrl = url.origin;
    const redirectUri = baseUrl + '/api/oauth/github/callback';

  const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user repo',
        state
  });

  return new Response(null, {
        status: 302,
        headers: {
                'Location': 'https://github.com/login/oauth/authorize?' + params.toString(),
                'Set-Cookie': `gh_oauth_state=${state}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax; Secure`
        }
  });
}
