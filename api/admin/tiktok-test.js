const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!key) return res.status(200).json({ error: 'No service role key', step: 1 });
    
    try {
        const supabase = createClient(supabaseUrl, key);
        
        // Try a simple SELECT first
        const { data: selectData, error: selectError } = await supabase
            .from('tiktok_recommendations')
            .select('*')
            .limit(1);
            
        if (selectError) return res.status(200).json({ 
            error: selectError.message, 
            code: selectError.code,
            details: selectError.details,
            hint: selectError.hint,
            step: 'SELECT failed' 
        });
        
        // Now try INSERT
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .insert({
                id: 'tk_test_' + Date.now(),
                product_name: 'Test Product',
                destination_url: 'https://tiktok.com'
            });
            
        if (error) return res.status(200).json({ 
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            step: 'INSERT failed'
        });
        
        return res.status(200).json({ ok: true, selectData, data });
    } catch(e) {
        return res.status(200).json({ error: e.message, step: 'exception' });
    }
};
