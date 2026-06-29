const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const { requireAdmin } = require('../../lib/verifyAdmin');

const SUPABASE_REF = 'bxzvxgjnlvbexeuocbey';
const STORAGE_BUCKET = 'tiktok-meta';
const STORAGE_FILE   = 'images.json';

async function readImageMap(key) {
    return new Promise((resolve) => {
        const opts = {
            hostname: SUPABASE_REF + '.supabase.co',
            path: '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + STORAGE_FILE,
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + key, 'apikey': key }
        };
        const req = https.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({}); } });
        });
        req.on('error', () => resolve({})); req.end();
    });
}

async function writeImageMap(key, map) {
    return new Promise((resolve) => {
        const body = JSON.stringify(map);
        const opts = {
            hostname: SUPABASE_REF + '.supabase.co',
            path: '/storage/v1/object/' + STORAGE_BUCKET + '/' + STORAGE_FILE,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + key, 'apikey': key,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'x-upsert': 'true'
            }
        };
        const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
        req.on('error', () => resolve()); req.write(body); req.end();
    });
}

module.exports = async function handler(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return; // requireAdmin already sent the 401/403 response

    const supabaseUrl = process.env.SUPABASE_URL || 'https://' + SUPABASE_REF + '.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    const supabase = createClient(supabaseUrl, key);

    // ── GET — list all rows with images merged (admin table) ────────────────
    if (req.method === 'GET') {
        try {
            const [dbResult, imgMap] = await Promise.all([
                supabase.from('tiktok_recommendations').select('*').order('id'),
                readImageMap(key)
            ]);
            const { data, error } = dbResult;
            if (error) return res.status(400).json({ error: error.message });
            const merged = (data || []).map(row => ({
                ...row,
                image_url: imgMap[row.id] || row.image_url || ''
            }));
            return res.json(merged);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, ...body } = req.body || {};

    try {
        // ── upsert ──────────────────────────────────────────────────────────
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

            const imgMap = await readImageMap(key);
            if (image_url && image_url.trim()) {
                imgMap[id] = image_url.trim();
            } else {
                delete imgMap[id];
            }
            await writeImageMap(key, imgMap);

            return res.json({ ok: true, image_saved: !!(image_url && image_url.trim()) });
        }

        // ── delete ──────────────────────────────────────────────────────────
        if (action === 'delete') {
            const { id } = body;
            if (!id) return res.status(400).json({ error: 'id required' });
            const { error } = await supabase.from('tiktok_recommendations').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            const imgMap = await readImageMap(key);
            delete imgMap[id];
            await writeImageMap(key, imgMap);
            return res.json({ ok: true });
        }

        // ── toggle ──────────────────────────────────────────────────────────
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
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
