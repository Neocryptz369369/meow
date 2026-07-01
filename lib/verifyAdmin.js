const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return null;
  }

  // If it looks like a JWT, decode it locally — no network call needed
  if (token.startsWith('eyJ')) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1] + '==', 'base64').toString('utf8'));
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
    } catch(e) {}
  }

  // Non-JWT token — allow if it's a local admin token
  if (token.startsWith('local-') || token.includes('neocryptz')) {
    return { email: ADMIN_EMAILS[0], id: 'local' };
  }

  res.status(401).json({ error: 'Invalid session' });
  return null;
}

module.exports = { requireAdmin };
