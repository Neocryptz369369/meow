const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../../lib/verifyAdmin');

const SUPABASE_REF = 'bxzvxgjnlvbexeuocbey';

module.exports = async function handler(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    const supabase = createClient(supabaseUrl, key);

    // GET — list all rows
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('tiktok_recommendations')
                .select('*')
                .order('id');
            if (error) return res.status(400).json({ error: error.message });
            return res.json(data || []);
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, ...body } = req.body || {};

    try {
        // upsert
        if (action === 'upsert') {
            const { id, visual_badge_text, product_name, display_headline, destination_url, image_url, is_active } = body;
            if (!id || !product_name) return res.status(400).json({ error: 'id and product_name required' });

            const payload = {
                id,
                visual_badge_text: visual_badge_text || '🔥 TikTok',
                product_name: product_name || 'TikTok Product',
                display_headline: display_headline || '',
                destination_url: destination_url || '',
                image_url: image_url || '',
                is_active: is_active !== false
            };

            const { error } = await supabase
                .from('tiktok_recommendations')
                .upsert(payload);

            if (error) return res.status(400).json({ error: error.message });
            return res.json({ ok: true });
        }

        // delete
        if (action === 'delete') {
            const { id } = body;
            if (!id) return res.status(400).json({ error: 'id required' });
            const { error } = await supabase
                .from('tiktok_recommendations')
                .delete()
                .eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.json({ ok: true });
        }

        // toggle
        if (action === 'toggle') {
            const { id, makeActive } = body;
            if (!id) return res.status(400).json({ error: 'id required' });
            if (makeActive) {
                await supabase.from('tiktok_recommendations').update({ is_active: false }).neq('id', id);
            }
            const { error } = await supabase
                .from('tiktok_recommendations')
                .update({ is_active: makeActive })
                .eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown action: ' + action });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
};
