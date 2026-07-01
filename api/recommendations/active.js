const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    try {
        const supabase = createClient(supabaseUrl, key);
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .select('*')
            .eq('is_active', true)
            .order('id');

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json(data || []);
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
};
