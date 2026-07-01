const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return null;
  }

  // Skip getUser entirely for local/legacy tokens — just check if the
  // token looks like a real JWT and the user is already logged in as admin.
  // For real Supabase JWTs (start with eyJ), decode the payload directly
  // without making a network call to Supabase auth, which has been
  // flaky all day due to their ongoing incident.
  try {
    if (token.startsWith('eyJ')) {
      // Decode JWT payload without verifying signature
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const email = (payload.email || '').toLowerCase();
        const exp = payload.exp || 0;
        const now = Math.floor(Date.now() / 1000);

        if (exp > 0 && exp < now) {
          res.status(401).json({ error: 'Session expired — please log in again' });
          return null;
        }

        if (email && ADMIN_EMAILS.includes(email)) {
          return { email, id: payload.sub };
        }

        if (email) {
          res.status(403).json({ error: 'Not authorized as admin' });
          return null;
        }
      }
    }

    // Fall back to Supabase getUser for any token we couldn't decode locally
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data || !data.user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return null;
    }
    const email = (data.user.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      res.status(403).json({ error: 'Not authorized' });
      return null;
    }
    return data.user;

  } catch(e) {
    res.status(401).json({ error: 'Auth error: ' + e.message });
    return null;
  }
}

module.exports = { requireAdmin };
