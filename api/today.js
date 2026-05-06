const https = require('https');
const { PBI_HOST, PBI_PATH, PBI_RESOURCE_KEY, QUERY_BODY, parsePBIResponse } = require('../lib/pbi');

module.exports = function handler(req, res) {
  const apiReq = https.request(
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
    (apiRes) => {
      let body = '';
      apiRes.on('data', (chunk) => (body += chunk));
      apiRes.on('end', () => {
        const reservations = parsePBIResponse(body);
        res.status(200).json({ reservations });
      });
    }
  );

  apiReq.on('error', (err) => {
    console.error('[pbi] error:', err.message);
    res.status(502).json({ reservations: [], error: err.message });
  });

  apiReq.write(QUERY_BODY);
  apiReq.end();
};
