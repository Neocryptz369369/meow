// Admin users list — Cloudflare Pages Function

async function requireAdmin(request, env) {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return { error: 'Missing Authorization header', status: 401 };

    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  try {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey }
        });
        if (!userRes.ok) return { error: 'Invalid or expired session', status: 401 };
        const user = await userRes.json();
        const email = (user.email || '').toLowerCase();
        const adminEmails = (env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
          .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
        if (!adminEmails.includes(email)) return { error: 'Not authorized as admin', status: 403 };
        return { user: { email, id: user.id } };
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
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
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
