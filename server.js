const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const APM_BASE = 'anc.apm.activecommunities.com';

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  // Proxy requests to the APM availability API
  if (pathname.startsWith('/api/availability/')) {
    const resourceId = pathname.replace('/api/availability/', '').replace(/\/$/, '');
    if (!/^\d+$/.test(resourceId)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid resource ID' }));
      return;
    }

    const start_date = parsed.searchParams.get('start_date');
    const end_date   = parsed.searchParams.get('end_date');
    const apiPath = `/seattle/rest/reservation/resource/availability/daily/${resourceId}` +
      `?start_date=${start_date}&end_date=${end_date}` +
      `&customer_id=0&company_id=0&event_type_id=-1&attendee=1` +
      `&no_cache=true&locale=en-US&ui_random=${Date.now()}`;

    console.log(`[proxy] GET court ${resourceId} (${start_date} → ${end_date})`);

    const apiReq = https.request(
      { hostname: APM_BASE, path: apiPath, method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
      (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(body);
        });
      }
    );

    apiReq.on('error', (err) => {
      console.error('[proxy] error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    apiReq.end();
    return;
  }

  // Serve index.html for everything else
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Could not load index.html');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Alki Beach Volleyball Calendar running at http://localhost:${PORT}`);
});
