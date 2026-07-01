const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(200).json({ error: 'No key' });

    try {
        const supabase = createClient(supabaseUrl, key);
        
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .insert({
                id: 'tk_test_' + Date.now(),
                product_name: 'Test Product',
                destination_url: 'https://tiktok.com'
            })
            .select();
            
        if (error) return res.status(200).json({ 
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            step: 'INSERT failed'
        });
        
        return res.status(200).json({ ok: true, data, step: 'INSERT worked' });
    } catch(e) {
        return res.status(200).json({ error: e.message, step: 'exception' });
    }
};
