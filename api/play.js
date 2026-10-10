// Player sign-in before the game starts (POST /api/play): name + email.
// Saved to the same Upstash Redis store as the Society (one row per email) if connected, forwarded to
// SIGNUP_WEBHOOK_URL (the Google Sheet) if set, and downloadable at /api/entries?key=ADMIN_KEY&list=players
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'POST only' }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true });   // bot trap: pretend it worked
  const name = clean(b.name, 60), email = clean(b.email, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Add your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "That email doesn't look right." });

  const entry = { type: 'player', name, email, createdAt: new Date().toISOString(), source: 'north-star-game' };
  let isNew = true;
  if (R_URL && R_TOKEN) {
    try {
      isNew = !!(await redis(['SET', 'ns:player:' + email, entry.createdAt, 'NX']));
      if (isNew) await redis(['RPUSH', 'ns:players', JSON.stringify(entry)]);
    } catch (e) { console.error('player storage error', e); }
  }
  console.log('NORTH STAR PLAYER', JSON.stringify(entry), isNew ? 'new' : 'returning');
  const hook = process.env.SIGNUP_WEBHOOK_URL;
  if (hook && isNew) {
    try { await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry), signal: AbortSignal.timeout(5000) }); }
    catch (e) { console.error('player webhook error', e); }
  }
  return res.status(200).json({ ok: true });
};
