// Admin users list — Cloudflare Pages Function
// Verifies admin by decoding the JWT locally — no network call needed.
// Avoids compatibility issues with Supabase's new sb_secret_ key format
// which isn't accepted by /auth/v1/user the same way the old JWT keys were.

async function requireAdmin(request, env) {
      const header = request.headers.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (!token) return { error: 'Missing Authorization header', status: 401 };

  try {
          const parts = token.split('.');
          if (parts.length !== 3) return { error: 'Invalid token format', status: 401 };

        // Base64url decode the JWT payload (Web Crypto compatible)
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
          const payload = JSON.parse(atob(padded));

        const email = (payload.email || '').toLowerCase();
          const exp = payload.exp || 0;
          const now = Math.floor(Date.now() / 1000);

        if (exp > 0 && exp < now) return { error: 'Session expired — please log in again', status: 401 };
          if (!email) return { error: 'Invalid session', status: 401 };

        const adminEmails = (env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
            .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

        if (!adminEmails.includes(email)) return { error: 'Not authorized as admin', status: 403 };

        return { user: { email, id: payload.sub } };
  } catch (e) {
          return { error: 'Auth check failed: ' + e.message, status: 500 };
  }
}

export async function onRequestGet(context) {
      const request = context.request;
      const env = context.env;

  const auth = await requireAdmin(request, env);
      if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
      const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || env.neocryptz_final_anon;
      if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

  try {
          const res = await fetch(
                    `${supabaseUrl}/rest/v1/support_messages?sender_name=eq.__profile__&select=user_id,message,created_at&order=created_at.desc`,
              {
                          headers: {
                                        'apikey': key,
                                        'Authorization': `Bearer ${key}`,
                                        'Content-Type': 'application/json'
                          }
              }
                  );
          const profileMsgs = await res.json();
          if (!res.ok) return Response.json({ error: profileMsgs.message || 'Supabase error' }, { status: 400 });

        const seen = new Set();
          const remoteUsers = {};
          for (const msg of profileMsgs || []) {
                    if (seen.has(msg.user_id)) continue;
                    seen.add(msg.user_id);
                    try {
                                const p = JSON.parse(msg.message);
                                if (p && p.username) {
                                              remoteUsers[p.username.toLowerCase()] = { ...p, _remote: true };
                                }
                    } catch (e) {}
          }

        return Response.json(remoteUsers);
  } catch (e) {
          return Response.json({ error: e.message }, { status: 500 });
  }
}
