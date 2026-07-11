// Admin image upload to Supabase Storage — Cloudflare Pages Function

async function requireAdmin(request, env) {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return { error: 'Missing Authorization header', status: 401 };

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
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

// Decode base64 string to Uint8Array (replaces Node's Buffer.from(data, 'base64'))
function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

  const auth = await requireAdmin(request, env);
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

  try {
        let body;
        try { body = await request.json(); } catch (e) { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

      const { fileName, contentType, data } = body || {};
        if (!data) return Response.json({ error: 'No image data provided' }, { status: 400 });

      const imageBytes = base64ToUint8Array(data);
        const ext = (fileName || 'image.jpg').split('.').pop().toLowerCase();
        const safeName = `tiktok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = `tiktok-ads/${safeName}`;
        const bucket = 'tiktok-meta';

      // Upload via Supabase Storage REST API
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`, {
              method: 'POST',
              headers: {
                        'apikey': key,
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': contentType || 'image/jpeg',
                        'x-upsert': 'false'
              },
              body: imageBytes
      });

      if (!uploadRes.ok) {
              const err = await uploadRes.json().catch(() => ({}));
              return Response.json({ error: err.message || 'Upload failed' }, { status: 500 });
      }

      // Build public URL
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
        return Response.json({ ok: true, url: publicUrl });

  } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
  }
}
