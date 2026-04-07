const https = require('https');

const APM_HOST = 'anc.apm.activecommunities.com';

module.exports = function handler(req, res) {
  const { resourceId, start_date, end_date } = req.query;

  if (!/^\d+$/.test(resourceId)) {
    return res.status(400).json({ error: 'Invalid resource ID' });
  }

  const apiPath =
    `/seattle/rest/reservation/resource/availability/daily/${resourceId}` +
    `?start_date=${start_date}&end_date=${end_date}` +
    `&customer_id=0&company_id=0&event_type_id=-1&attendee=1` +
    `&no_cache=true&locale=en-US&ui_random=${Date.now()}`;

  const apiReq = https.request(
    {
      hostname: APM_HOST,
      path: apiPath,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    },
    (apiRes) => {
      let body = '';
      apiRes.on('data', (chunk) => (body += chunk));
      apiRes.on('end', () => {
        res.status(apiRes.statusCode).setHeader('Content-Type', 'application/json').send(body);
      });
    }
  );

  apiReq.on('error', (err) => {
    res.status(502).json({ error: err.message });
  });

  apiReq.end();
};
