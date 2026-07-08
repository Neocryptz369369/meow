/**
 * NEOCRYPTZ AUTH API — Secure Backend Authentication Service
 * 
 * This backend service handles all authentication securely:
 * - Stores Supabase API keys server-side (never exposed to client)
 * - Validates credentials
 * - Issues secure session tokens
 * - Manages user sessions
 * 
 * Setup Instructions:
 * 1. Install Node.js dependencies: npm install express cors dotenv @supabase/supabase-js
 * 2. Create a .env file with your Supabase credentials:
 *    SUPABASE_URL=https://bxzvxgjnlvbexeuocbey.supabase.co
 *    SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4enZ4Z2pubHZiZXhldW9jYmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzY3NjQsImV4cCI6MjA5NTY1Mjc2NH0.DWlzaP_xciNK...
 *    JWT_SECRET=your-secure-jwt-secret-key-here
 * 3. Run: node auth-server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase with server-side keys (NEVER exposed to client)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/login
 * Login with username or email
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Map username to email for Supabase
    let email = username.indexOf('@') >= 0 
      ? username 
      : username.toLowerCase() === 'neocryptz' 
        ? 'neocryptz@yahoo.com' 
        : username + '@neocryptz.ai';

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Create secure JWT session token
    const sessionToken = jwt.sign(
      {
        userId: data.user.id,
        email: data.user.email,
        username: username,
        accessToken: data.session.access_token
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return res.json({
      ok: true,
      sessionToken: sessionToken,
      user: {
        id: data.user.id,
        email: data.user.email,
        username: username,
        plan: 'Free',
        credits: 40,
        is_admin: username.toLowerCase() === 'neocryptz'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 * Register a new user account
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Create user in Supabase
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { username: username }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Create secure JWT session token
    const sessionToken = jwt.sign(
      {
        userId: data.user.id,
        email: data.user.email,
        username: username,
        accessToken: data.session?.access_token || ''
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return res.json({
      ok: true,
      id: data.user.id,
      sessionToken: sessionToken,
      message: 'Account created successfully'
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/verify
 * Verify a session token
 */
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' });
    }

    // Verify and decode JWT
    const decoded = jwt.verify(sessionToken, jwtSecret);

    return res.json({
      ok: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        username: decoded.username
      }
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Session expired' });
    }
    return res.status(401).json({ error: 'Invalid session token' });
  }
});

/**
 * POST /api/auth/logout
 * Logout and invalidate session
 */
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    // Token is invalidated on client side by deletion
    // Server-side logout can be enhanced with token blacklist if needed
    return res.json({ ok: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Auth server running' });
});

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔐 Auth server running on http://localhost:${PORT}`);
  console.log(`✅ Supabase keys are SECURE and NOT exposed to clients`);
});
