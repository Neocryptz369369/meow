const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../../lib/verifyAdmin');

module.exports = async function handler(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return res.status(500).json({ error: 'Missing service role key' });

    const supabase = createClient(supabaseUrl, key);

    try {
          const { fileName, contentType, data } = req.body || {};
          if (!data) return res.status(400).json({ error: 'No image data provided' });

      // Decode base64 data
      const buffer = Buffer.from(data, 'base64');

      // Generate a unique file path
      const ext = (fileName || 'image.jpg').split('.').pop().toLowerCase();
          const safeName = `tiktok-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
          const filePath = `tiktok-ads/${safeName}`;

      // Upload to Supabase Storage bucket "product-images"
      const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, buffer, {
                      contentType: contentType || 'image/jpeg',
                      upsert: false
            });

      if (uploadError) {
              console.error('Supabase upload error:', uploadError);
              return res.status(500).json({ error: uploadError.message });
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
          if (!publicUrl) return res.status(500).json({ error: 'Could not get public URL' });

      return res.json({ ok: true, url: publicUrl });

    } catch (e) {
          console.error('upload-image error:', e);
          return res.status(500).json({ error: e.message });
    }
};

// Allow large image uploads (up to 10MB base64)
module.exports.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
