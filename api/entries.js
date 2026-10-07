// Download sign-ups as a spreadsheet:
//   Society members (wheel prizes): /api/entries?key=YOUR_ADMIN_KEY
//   Everyone who signed in to play:  /api/entries?key=YOUR_ADMIN_KEY&list=players
// Set ADMIN_KEY in Vercel environment variables first (any long password). Needs the Upstash Redis store.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.ADMIN_KEY;
  if (!key || req.query.key !== key) return res.status(401).send('Not allowed');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(500).send('No database connected yet');
  const players = req.query.list === 'players';
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(['LRANGE', players ? 'ns:players' : 'ns:entries', 0, -1]) });
  const rows = ((await r.json()).result || []).map(s => JSON.parse(s));
  const cols = players ? ['createdAt', 'name', 'email'] : ['member', 'createdAt', 'name', 'email', 'phone', 'consent', 'prizeName'];
  const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [cols.join(',')].concat(rows.map(e => cols.map(c => cell(e[c])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + (players ? 'north-star-players' : 'north-star-society') + '.csv"');
  return res.status(200).send(csv);
};
