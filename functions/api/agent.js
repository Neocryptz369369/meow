// functions/api/agent.js
// Thin proxy: forwards agent task requests from the frontend to the standalone
// Steel + Cloudflare Workers AI Node service (deployed separately on Vercel).
// See steel-agent/api/run.js in this same repo for the actual agent loop.

export async function onRequestPost(context) {
      const request = context.request;
      const env = context.env;

  const serviceUrl = env.STEEL_AGENT_URL;
      if (!serviceUrl) {
              return Response.json({ error: 'STEEL_AGENT_URL not configured on server.' }, { status: 500 });
      }

  let bodyText;
      try {
              bodyText = await request.text();
      } catch (e) {
              bodyText = '{}';
      }

  let upstream;
      try {
              upstream = await fetch(serviceUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: bodyText
              });
      } catch (e) {
              return Response.json({ error: 'Could not reach the agent service: ' + e.message }, { status: 502 });
      }

  const text = await upstream.text();
      return new Response(text, {
              status: upstream.status,
              headers: { 'Content-Type': 'application/json' }
      });
}
