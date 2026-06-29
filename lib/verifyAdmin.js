const { createClient } = require('@supabase/supabase-js');

// The Supabase anon key is meant to be public (it's already sitting in your
// index.html) — that's normal and fine. It is NOT what protects this route.
// What protects this route is verifying the token actually belongs to a real,
// signed-in Supabase user, and checking THAT user against the admin list below.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4enZ4Z2pubHZiZXhldW9jYmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzY3NjQsImV4cCI6MjA5NTY1Mjc2NH0.DWlzaP_xciNKfBDO-c_VTxTsaFVZjdfANesVY9Kjih0';

// Comma-separated list of emails allowed to use /api/admin/* routes.
// Set this in your real environment (Vercel → Project → Settings → Environment
// Variables), not in code.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'neocryptz@neocryptz.ai')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Call this as the FIRST line of any /api/admin/* handler:
//   const admin = await requireAdmin(req, res);
//   if (!admin) return;   // requireAdmin already sent the error response
//
// Works the same whether req/res come from a plain Vercel function or an
// Express route — both shapes support res.status().json().
async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return null;
  }

  // This call asks Supabase itself "is this a real, currently-valid session?"
  // A forged or expired token fails here regardless of anything the client claims.
  const { data, error } = await authClient.auth.getUser(token);
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
}

module.exports = { requireAdmin };
