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

  // Use the service role key to verify the token — unlike the anon key,
  // the service role key has full access to verify any user session correctly.
  try {
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
    res.status(401).json({ error: 'Session verification failed: ' + e.message });
    return null;
  }
}

module.exports = { requireAdmin };
