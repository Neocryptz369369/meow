// Admin TikTok recommendations CRUD — Cloudflare Pages Function

async function requireAdmin(request, env) {
        const header = request.headers.get('authorization') || '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
        if (!token) return { error: 'Missing Authorization header', status: 401 };

    const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

    try {
                const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                                headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey }
                });
                if (!userRes.ok) return { error: 'Invalid or expired session', status: 401 };
                const user = await userRes.json();
                const email = (user.email || '').toLowerCase();
                const adminEmails = (env.ADMIN_EMAILS || 'neocryptz@yahoo.com')
                    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
                if (!adminEmails.includes(email)) return { error: 'Not authorized as admin', status: 403 };
                return { user: { email, id: user.id } };
    } catch (e) {
                return { error: 'Auth check failed: ' + e.message, status: 500 };
    }
}

export async function onRequest(context) {
        const request = context.request;
        const env = context.env;
        const method = request.method;

    const auth = await requireAdmin(request, env);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

    const supabaseUrl = env.SUPABASE_URL || env.neocryptz_final_url || 'https://bxzvxgjnlvbexeuocbey.supabase.co';
        const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
        if (!key) return Response.json({ error: 'Missing service role key' }, { status: 500 });

    const sbHeaders = {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
    };

    if (method === 'GET') {
                try {
                                const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?order=sort_order.asc.nullslast,id.asc`, { headers: sbHeaders });
                                const data = await res.json();
                                if (!res.ok) return Response.json({ error: data.message || 'Supabase error' }, { status: 400 });
                                return Response.json(data);
                } catch (e) {
                                return Response.json({ error: e.message }, { status: 500 });
                }
    }

    if (method === 'POST') {
                let body;
                try { body = await request.json(); } catch (e) { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
                const { action, ...rest } = body;

            if (action === 'upsert') {
                            const { id, visual_badge_text, product_name, display_headline, destination_url, image_url, is_active } = rest;
                            if (!id || !product_name) return Response.json({ error: 'id and product_name required' }, { status: 400 });

                    let sort_order = rest.sort_order;
                            if (sort_order === undefined || sort_order === null) {
                                                const maxRes = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?select=sort_order&order=sort_order.desc.nullslast&limit=1`, { headers: sbHeaders });
                                                const maxData = await maxRes.json();
                                                sort_order = (Array.isArray(maxData) && maxData[0] && maxData[0].sort_order != null) ? maxData[0].sort_order + 1 : 1;
                            }

                    const payload = {
                                        id,
                                        visual_badge_text: visual_badge_text || 'TikTok',
                                        product_name: product_name || 'TikTok Product',
                                        display_headline: display_headline || '',
                                        destination_url: destination_url || '',
                                        image_url: image_url || '',
                                        is_active: is_active !== false,
                                        sort_order
                    };
                            const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations`, {
                                                method: 'POST',
                                                headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
                                                body: JSON.stringify(payload)
                            });
                            if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
                            return Response.json({ ok: true });
            }

            if (action === 'delete') {
                            const { id } = rest;
                            if (!id) return Response.json({ error: 'id required' }, { status: 400 });
                            const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(id)}`, {
                                                method: 'DELETE',
                                                headers: sbHeaders
                            });
                            if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
                            return Response.json({ ok: true });
            }

            if (action === 'toggle') {
                            const { id, makeActive } = rest;
                            if (!id) return Response.json({ error: 'id required' }, { status: 400 });
                            if (makeActive) {
                                                await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=neq.${encodeURIComponent(id)}`, {
                                                                        method: 'PATCH',
                                                                        headers: sbHeaders,
                                                                        body: JSON.stringify({ is_active: false })
                                                });
                            }
                            const res = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(id)}`, {
                                                method: 'PATCH',
                                                headers: sbHeaders,
                                                body: JSON.stringify({ is_active: !!makeActive })
                            });
                            if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
                            return Response.json({ ok: true });
            }

            if (action === 'reorder') {
                            const { id, direction } = rest;
                            if (!id || (direction !== 'up' && direction !== 'down')) {
                                                return Response.json({ error: 'id and direction (up|down) required' }, { status: 400 });
                            }
                            const listRes = await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?select=id,sort_order&order=sort_order.asc.nullslast,id.asc`, { headers: sbHeaders });
                            const list = await listRes.json();
                            if (!listRes.ok) return Response.json({ error: list.message || 'Supabase error' }, { status: 400 });

                    const idx = list.findIndex(item => item.id === id);
                            if (idx === -1) return Response.json({ error: 'Ad not found' }, { status: 404 });
                            const swapIdx = (direction === 'up' ? idx - 1 + list.length : idx + 1) % list.length;
                            if (swapIdx < 0 || swapIdx >= list.length) return Response.json({ ok: true, unchanged: true });

                    const a = list[idx];
                            const b = list[swapIdx];
                            const aOrder = a.sort_order != null ? a.sort_order : idx + 1;
                            const bOrder = b.sort_order != null ? b.sort_order : swapIdx + 1;

                    await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(a.id)}`, {
                                        method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ sort_order: bOrder })
                    });
                            await fetch(`${supabaseUrl}/rest/v1/tiktok_recommendations?id=eq.${encodeURIComponent(b.id)}`, {
                                                method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ sort_order: aOrder })
                            });
                            return Response.json({ ok: true });
            }

            if (action === 'set_randomize') {
                            const { value } = rest;
                            const res = await fetch(`${supabaseUrl}/rest/v1/app_settings`, {
                                                method: 'POST',
                                                headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
                                                body: JSON.stringify({ key: 'tiktok_randomize', value: value ? 'true' : 'false' })
                            });
                            if (!res.ok) { const d = await res.json(); return Response.json({ error: d.message }, { status: 400 }); }
                            return Response.json({ ok: true });
            }

            return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
