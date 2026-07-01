const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../../lib/verifyAdmin');

const SUPABASE_REF = 'bxzvxgjnlvbexeuocbey';
const STORAGE_BUCKET = 'tiktok-meta';
const STORAGE_FILE = 'images.json';

module.exports = async function handler(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const supabaseUrl = process.env.SUPABASE_URL || 'https://' + SUPABASE_REF + '.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    const supabase = createClient(supabaseUrl, key);

    async function readImageMap() {
        try {
            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .download(STORAGE_FILE);
            if (error || !data) return {};
            const text = await data.text();
            return JSON.parse(text);
        } catch(_) { return {}; }
    }

    async function writeImageMap(map) {
        try {
            const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
            await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(STORAGE_FILE, blob, { upsert: true, contentType: 'application/json' });
        } catch(_) {}
    }

    // GET — list all rows with images merged
    if (req.method === 'GET') {
        try {
            const [dbResult, imgMap] = await Promise.all([
                supabase.from('tiktok_recommendations').select('*').order('id'),
                readImageMap()
            ]);
            const { data, error } = dbResult;
            if (error) return res.status(400).json({ error: error.message });
            const merged = (data || []).map(row => ({
                ...row,
                image_url: imgMap[row.id] || row.image_url || ''
            }));
            return res.json(merged);
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

            const dbPayload = { id, visual_badge_text, product_name, display_headline, destination_url, is_active: is_active !== false };

            let { error } = await supabase.from('tiktok_recommendations').upsert({ ...dbPayload, image_url });
            if (error && error.message && error.message.includes('image_url')) {
                const r2 = await supabase.from('tiktok_recommendations').upsert(dbPayload);
                if (r2.error) return res.status(400).json({ error: r2.error.message });
            } else if (error) {
                return res.status(400).json({ error: error.message });
            }

            const imgMap = await readImageMap();
            if (image_url && image_url.trim()) {
                imgMap[id] = image_url.trim();
            } else {
                delete imgMap[id];
            }
            await writeImageMap(imgMap);

            return res.json({ ok: true, image_saved: !!(image_url && image_url.trim()) });
        }

        // delete
        if (action === 'delete') {
            const { id } = body;
            if (!id) return res.status(400).json({ error: 'id required' });
            const { error } = await supabase.from('tiktok_recommendations').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            const imgMap = await readImageMap();
            delete imgMap[id];
            await writeImageMap(imgMap);
            return res.json({ ok: true });
        }

        // toggle
        if (action === 'toggle') {
            const { id, makeActive } = body;
            if (!id) return res.status(400).json({ error: 'id required' });
            if (makeActive) {
                await supabase.from('tiktok_recommendations').update({ is_active: false }).neq('id', id);
            }
            const { error } = await supabase.from('tiktok_recommendations').update({ is_active: makeActive }).eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown action: ' + action });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
};
