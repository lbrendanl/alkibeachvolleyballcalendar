const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { PBI_HOST, PBI_PATH, PBI_RESOURCE_KEY, QUERY_BODY, parsePBIResponse } = require('./lib/pbi');

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

  // Proxy to Power BI for today's confirmed reservations
  if (pathname === '/api/today') {
    console.log('[pbi] fetching today\'s reservations');
    const pbiReq = https.request(
      {
        hostname: PBI_HOST,
        path:     PBI_PATH,
        method:   'POST',
        headers: {
          'Content-Type':          'application/json;charset=UTF-8',
          'Content-Length':        Buffer.byteLength(QUERY_BODY),
          'X-PowerBI-ResourceKey': PBI_RESOURCE_KEY,
          'Accept':                'application/json',
          'User-Agent':            'Mozilla/5.0',
        },
      },
      (pbiRes) => {
        let body = '';
        pbiRes.on('data', chunk => body += chunk);
        pbiRes.on('end', () => {
          const reservations = parsePBIResponse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ reservations }));
        });
      }
    );
    pbiReq.on('error', (err) => {
      console.error('[pbi] error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ reservations: [], error: err.message }));
    });
    pbiReq.write(QUERY_BODY);
    pbiReq.end();
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
