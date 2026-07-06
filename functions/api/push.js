export async function onRequestPost(context) {
const request = context.request;
const env = context.env;

let body;
try {
body = await request.json();
} catch (e) {
return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
}

const { username, ...actionJson } = body || {};

// Same admin trust model chat.js already uses to gate the GitHub execution engine.
if ((username || '').toLowerCase() !== 'neocryptz') {
return Response.json({ error: 'Unauthorized: admin only.' }, { status: 403 });
}

if (!env.EXECUTE_SECRET) {
return Response.json({ error: 'Execution not configured on server.' }, { status: 500 });
}

try {
const execRes = await fetch(new URL('/api/execute', request.url), {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-execute-secret': env.EXECUTE_SECRET
},
body: JSON.stringify(actionJson)
});

const data = await execRes.json();
return Response.json(data, { status: execRes.status });
} catch (e) {
return Response.json({ error: 'Push proxy error: ' + e.message }, { status: 500 });
}
}
