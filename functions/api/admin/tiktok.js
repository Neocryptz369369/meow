// Cloudflare Pages Function: /api/admin/tiktok  (GET list, POST upsert/delete/toggle)
const STORAGE_BUCKET = 'tiktok-meta';
const STORAGE_FILE = 'images.json';

function conf(context){
  const e = context.env || {};
  const url = (e.SUPABASE_URL || e.neocryptz_final_url || (e.SUPABASE_REF ? 'https://'+e.SUPABASE_REF+'.supabase.co' : '')).replace(/[/]+$/,'');
  const key = e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_KEY || e.neocryptz_final_anon || '';
  return { url, key };
}

function h(key){ return { 'Authorization':'Bearer '+key, 'apikey':key, 'Content-Type':'application/json' }; }

async function readImageMap(url,key){
  try{
    const r = await fetch(url+'/storage/v1/object/public/'+STORAGE_BUCKET+'/'+STORAGE_FILE,{headers:h(key)});
    if(!r.ok) return {};
    return await r.json();
  }catch(e){ return {}; }
}

async function writeImageMap(url,key,map){
  await fetch(url+'/storage/v1/object/'+STORAGE_BUCKET+'/'+STORAGE_FILE,{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+key, 'apikey':key, 'Content-Type':'application/json', 'x-upsert':'true' },
    body: JSON.stringify(map)
  });
}

function json(b,s){ return new Response(JSON.stringify(b),{status:s||200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}); }

export async function onRequest(context){
  const { request } = context;
  const { url, key } = conf(context);
  const base = url+'/rest/v1/tiktok_recommendations';

  if(request.method === 'GET'){
    try{
      const [dbR, imgMap] = await Promise.all([
        fetch(base+'?select=*&order=id.asc',{headers:h(key)}).then(r=>r.ok?r.json():[]),
        readImageMap(url,key)
      ]);
      const merged = (Array.isArray(dbR)?dbR:[]).map(row=>({ ...row, image_url: imgMap[row.id] || row.image_url || '' }));
      return json(merged,200);
    }catch(e){ return json({ error:String(e) },500); }
  }

  if(request.method !== 'POST') return json({ error:'Method not allowed' },405);

  let body={};
  try{ body = await request.json(); }catch(e){ return json({ error:'Invalid JSON' },400); }
  const { action } = body;

  try{
    if(action === 'upsert'){
      const { id, visual_badge_text, product_name, display_headline, destination_url, image_url, is_active } = body;
      const dbPayload = { id, visual_badge_text, product_name, display_headline, destination_url, is_active: is_active !== false };
      const r = await fetch(base+'?on_conflict=id',{ method:'POST', headers:{ ...h(key), 'Prefer':'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(dbPayload) });
      if(!r.ok) return json({ error: await r.text() },400);
      const imgMap = await readImageMap(url,key);
      if(image_url && String(image_url).trim()){ imgMap[id] = image_url; } else { delete imgMap[id]; }
      await writeImageMap(url,key,imgMap);
      return json({ ok:true, image_saved: !!(image_url && String(image_url).trim()) },200);
    }

    if(action === 'delete'){
      const { id } = body;
      if(!id) return json({ error:'id required' },400);
      const r = await fetch(base+'?id=eq.'+encodeURIComponent(id),{ method:'DELETE', headers:h(key) });
      if(!r.ok) return json({ error: await r.text() },400);
      const imgMap = await readImageMap(url,key);
      delete imgMap[id];
      await writeImageMap(url,key,imgMap);
      return json({ ok:true },200);
    }

    if(action === 'toggle'){
      const { id, makeActive } = body;
      if(!id) return json({ error:'id required' },400);
      if(makeActive){
        await fetch(base+'?id=neq.'+encodeURIComponent(id),{ method:'PATCH', headers:h(key), body: JSON.stringify({ is_active:false }) });
      }
      const r = await fetch(base+'?id=eq.'+encodeURIComponent(id),{ method:'PATCH', headers:h(key), body: JSON.stringify({ is_active: makeActive }) });
      if(!r.ok) return json({ error: await r.text() },400);
      return json({ ok:true },200);
    }

    return json({ error:'Unknown action: '+action },400);
  }catch(e){ return json({ error:String(e) },500); }
}
