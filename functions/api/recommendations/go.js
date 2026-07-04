// Redirect endpoint — looks up destination_url by id and redirects there

export async function onRequestGet(context) {
    const env = context.env;
    const { searchParams } = new URL(context.request.url);
    const id = searchParams.get('id');

  if (!id) return Response.redirect('https://shop.tiktok.com', 302);

  const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

  try {
        if (key) {
                const res = await fetch(
                          `${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(id)}&select=destination_url&limit=1`,
                  {
                              headers: {
                                            'apikey': key,
                                            'Authorization': `Bearer ${key}`,
                                            'Content-Type': 'application/json'
                              }
                  }
                        );
                const rows = await res.json();
                if (Array.isArray(rows) && rows[0]?.destination_url) {
                          return Response.redirect(rows[0].destination_url, 302);
                }
        }
  } catch (_) {}

  return Response.redirect('https://shop.tiktok.com', 302);
}
