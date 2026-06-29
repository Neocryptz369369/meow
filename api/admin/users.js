const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../../lib/verifyAdmin');

module.exports = async function handler(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return; // requireAdmin already sent the 401/403 response

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    const supabase = createClient(supabaseUrl, key);

    try {
        const { data: profileMsgs, error } = await supabase
            .from('support_messages')
            .select('user_id, message, created_at')
            .eq('sender_name', '__profile__')
            .order('created_at', { ascending: false });

        if (error) return res.status(400).json({ error: error.message });

        // Deduplicate by user_id — keep most recent profile per user.
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
            } catch (e) { /* skip malformed rows */ }
        }

        return res.json(remoteUsers);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
