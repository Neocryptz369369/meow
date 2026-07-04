// GitHub OAuth — Step 2: exchange code for token, store securely

async function encrypt(plainText, secret) {
    const encoder = new TextEncoder();
    const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plainText));
    const result = new Uint8Array(12 + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), 12);
    let binary = '';
    for (const byte of result) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export async function onRequestGet(context) {
    const request = context.request;
    const env = context.env;
    const url = new URL(request.url);
    const baseUrl = url.origin;
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

  if (error) return Response.redirect(baseUrl + '/?oauth_error=github_denied', 302);

  const cookieHeader = request.headers.get('cookie') || '';
    const cookies = {};
    cookieHeader.split(';').forEach(part => {
          const trimmed = part.trim();
          const idx = trimmed.indexOf('=');
          if (idx > 0) cookies[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    });

  if (!state || state !== cookies.gh_oauth_state) {
        return new Response('State mismatch — link may have expired. Please try connecting again.', { status: 400 });
  }

  const clientId = env.GH_OAUTH_CLIENT_ID;
    const clientSecret = env.GH_OAUTH_CLIENT_SECRET;
    const encSecret = env.SERVER_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  if (!clientId || !clientSecret) {
        return new Response('GitHub OAuth is not fully configured on the server.', { status: 500 });
  }

  try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: baseUrl + '/api/oauth/github/callback' })
        });
        const tokenData = await tokenRes.json();

      if (!tokenData.access_token) return Response.redirect(baseUrl + '/?oauth_error=github_token_failed', 302);

      const userRes = await fetch('https://api.github.com/user', {
              headers: { 'Authorization': 'Bearer ' + tokenData.access_token, 'Accept': 'application/vnd.github+json' }
      });
        const ghUser = await userRes.json();

      const encryptedToken = await encrypt(tokenData.access_token, encSecret);

      const redirectParams = new URLSearchParams({
              oauth_connected: 'github',
              oauth_username: ghUser.login || ''
      });

      return new Response(null, {
              status: 302,
              headers: {
                        'Location': baseUrl + '/?' + redirectParams.toString(),
                        'Set-Cookie': [
                                    `gh_oauth_state=; Path=/; HttpOnly; Max-Age=0`,
                                    `gh_oauth_token=${encryptedToken}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax; Secure`
                                  ].join(', ')
              }
      });
  } catch (e) {
        return Response.redirect(baseUrl + '/?oauth_error=github_exception', 302);
  }
}
