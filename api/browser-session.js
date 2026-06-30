// Creates a Browserbase session and returns the live view URL immediately
// Frontend embeds this URL in an iframe so the user can watch live

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.BROWSERBASE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'BROWSERBASE_API_KEY not set in Vercel environment variables' });

    try {
        let projectId = null;
        const bbHeaders = {
            'x-bb-api-key': apiKey,
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
        };
        try {
            const projRes = await fetch('https://www.browserbase.com/v1/projects', {
                headers: bbHeaders
            });
            if (projRes.ok) {
                const projData = await projRes.json();
                const projects = projData.data || projData;
                projectId = Array.isArray(projects) && projects[0]?.id;
            }
        } catch (_) {}

        const body = projectId ? { projectId } : {};
        const sessRes = await fetch('https://www.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: bbHeaders,
            body: JSON.stringify(body)
        });

        if (!sessRes.ok) {
            const err = await sessRes.text();
            return res.status(500).json({ error: 'Browserbase session creation failed: ' + err });
        }

        const session = await sessRes.json();

        const liveViewUrl = session.debuggerFullscreenUrl
            || session.liveViewUrl
            || `https://www.browserbase.com/sessions/${session.id}`;

        return res.status(200).json({
            sessionId: session.id,
            liveViewUrl,
            status: session.status
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
