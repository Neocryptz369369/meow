const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(200).json({ error: 'No key' });

    try {
        const supabase = createClient(supabaseUrl, key);
        
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .upsert({
                id: 'tk_test_upsert',
                product_name: 'Test Product',
                destination_url: 'https://tiktok.com',
                visual_badge_text: 'TikTok',
                display_headline: '',
                image_url: '',
                is_active: true
            })
            .select();
            
        if (error) return res.status(200).json({ 
            error: error.message,
            code: error.code,
            details: error.details,
            step: 'UPSERT failed'
        });
        
        return res.status(200).json({ ok: true, data, step: 'UPSERT worked' });
    } catch(e) {
        return res.status(200).json({ error: e.message, step: 'exception' });
    }
};
