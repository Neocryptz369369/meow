const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    // Hardcoded URL to eliminate any env var issues
    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!key) return res.status(200).json({ error: 'No service role key', keyLength: 0 });
    
    // Log the key length to confirm it's being read correctly
    const keyPreview = key.substring(0, 20) + '...';
    
    try {
        const supabase = createClient(supabaseUrl, key);
        
        const { data, error } = await supabase
            .from('tiktok_recommendations')
            .select('*')
            .limit(1);
            
        if (error) return res.status(200).json({ 
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            keyPreview,
            step: 'SELECT failed'
        });
        
        return res.status(200).json({ ok: true, data, keyPreview, step: 'SELECT worked' });
    } catch(e) {
        return res.status(200).json({ error: e.message, step: 'exception' });
    }
};
