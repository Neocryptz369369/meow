const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const supabaseUrl = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!key) return res.status(200).json({ error: 'No service role key', step: 1 });
    
    try {
        const supabase = createClient(supabaseUrl, key);
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .upsert({
                id: 'tk_test_' + Date.now(),
                product_name: 'Test Product',
                display_headline: 'Test',
                visual_badge_text: 'TikTok',
                destination_url: 'https://tiktok.com',
                image_url: '',
                is_active: true
            });
        if (error) return res.status(200).json({ error: error.message, step: 2 });
        return res.status(200).json({ ok: true, step: 3, data });
    } catch(e) {
        return res.status(200).json({ error: e.message, step: 4 });
    }
};
