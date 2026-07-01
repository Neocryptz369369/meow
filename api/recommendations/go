const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.redirect('https://shop.tiktok.com');

    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
        if (key) {
            const supabase = createClient(supabaseUrl, key);
            await supabase.from('tiktok_recommendations').select('id').eq('id', id).single();
        }
    } catch(_) {}

    try {
        if (key) {
            const supabase = createClient(supabaseUrl, key);
            const { data } = await supabase
                .from('tiktok_recommendations')
                .select('destination_url')
                .eq('id', id)
                .single();
            if (data && data.destination_url) {
                return res.redirect(data.destination_url);
            }
        }
    } catch(_) {}

    return res.redirect('https://shop.tiktok.com');
};
