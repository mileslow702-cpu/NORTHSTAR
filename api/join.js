// North Star Society sign-up + prize wheel (Vercel serverless function: POST /api/join).
// The prize is picked here on the server so nobody can rig the wheel from the browser.
//
// Where sign-ups go (set these in Vercel > Project > Settings > Environment Variables):
//   KV_REST_API_URL + KV_REST_API_TOKEN   Upstash Redis (Vercel Marketplace > Upstash for Redis adds both automatically).
//                                         Stores every member, blocks repeat entries, enforces prize limits,
//                                         and powers the CSV download at /api/entries.
//   SIGNUP_WEBHOOK_URL                    Optional. Every sign-up is also POSTed here as JSON
//                                         (GoHighLevel inbound webhook, Zapier, Make, a Google Sheets Apps Script...).
//   PRIZE_WEIGHTS                         Optional odds (percent), in prize order. Default "0.34,0.33,0.33,4,95":
//                                         Zoom call 95%, live session 4%, the other three split the last 1%.
//   PRIZE_LIMITS                          Optional max winners per prize, 0 = unlimited. Default no limits.
//                                         Limits need Redis to count; when a prize runs out it leaves the wheel.
const crypto = require('crypto');

const PRIZES = [
  { id: 'card', name: 'Signed North Star Society card' },
  { id: 'bandana', name: 'North Star bandana' },
  { id: 'tee', name: 'North Star t-shirt' },
  { id: 'session', name: 'North Star live recording session access' },
  { id: 'zoom', name: '10-minute Zoom call with Miles Low' },
];
const list = (v, d) => { const a = String(v || d).split(',').map(x => Number(x.trim())); return PRIZES.map((_, i) => (Number.isFinite(a[i]) && a[i] >= 0 ? a[i] : 0)); };
const WEIGHTS = list(process.env.PRIZE_WEIGHTS, '0.34,0.33,0.33,4,95');
const LIMITS = list(process.env.PRIZE_LIMITS, '0,0,0,0,0');

const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function pickPrize(counts) {
  const w = WEIGHTS.map((x, i) => (LIMITS[i] > 0 && counts[i] >= LIMITS[i] ? 0 : x));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;   // everything capped: fall back to the signed card
  let r = crypto.randomInt(0, 1e6) / 1e6 * total;
  for (let i = 0; i < w.length; i++) { if (r < w[i]) return i; r -= w[i]; }
  return w.findIndex(x => x > 0);
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'POST only' }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(400).json({ ok: false, error: 'Something went wrong. Try again.' });   // bot trap

  const name = clean(b.name, 60);
  const email = clean(b.email, 120).toLowerCase();
  let phone = String(b.phone || '').replace(/\D/g, '');
  if (phone.length === 10) phone = '1' + phone;   // US numbers without the country code
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Add your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false, error: "That email doesn't look right." });
  if (phone.length < 11 || phone.length > 15) return res.status(400).json({ ok: false, error: 'Add a phone number with area code.' });

  const entry = { type: 'society', name, email, phone: '+' + phone, consent: !!b.consent, createdAt: new Date().toISOString(), source: 'north-star-game' };
  const useRedis = !!(R_URL && R_TOKEN);
  try {
    if (useRedis) {
      const prior = (await redis(['GET', 'ns:email:' + email])) || (await redis(['GET', 'ns:phone:' + phone]));
      if (prior) {
        const old = JSON.parse((await redis(['GET', 'ns:member:' + prior])) || 'null');
        if (old) return res.status(200).json({ ok: true, already: true, prize: old.prize, prizeName: PRIZES[old.prize].name, member: old.member });
      }
      const counts = await Promise.all(PRIZES.map(p => redis(['GET', 'ns:count:' + p.id]).then(Number)));
      entry.prize = pickPrize(counts);
      entry.member = await redis(['INCR', 'ns:members']);
      const claimed = await redis(['SET', 'ns:email:' + email, String(entry.member), 'NX']);
      if (!claimed) {   // two submits at once: return the one that won the race
        const old = JSON.parse((await redis(['GET', 'ns:member:' + (await redis(['GET', 'ns:email:' + email]))])) || 'null');
        if (old) return res.status(200).json({ ok: true, already: true, prize: old.prize, prizeName: PRIZES[old.prize].name, member: old.member });
      }
      await redis(['SET', 'ns:phone:' + phone, String(entry.member), 'NX']);
      entry.prizeName = PRIZES[entry.prize].name;
      await redis(['SET', 'ns:member:' + entry.member, JSON.stringify(entry)]);
      await redis(['INCR', 'ns:count:' + PRIZES[entry.prize].id]);
      await redis(['RPUSH', 'ns:entries', JSON.stringify(entry)]);
    } else {
      entry.prize = pickPrize(PRIZES.map(() => 0));
      entry.member = 0;
      entry.prizeName = PRIZES[entry.prize].name;
    }
  } catch (e) {
    console.error('society storage error', e);
    return res.status(500).json({ ok: false, error: 'The Society is busy right now. Try again in a minute.' });
  }

  console.log('NORTH STAR SOCIETY SIGNUP', JSON.stringify(entry));   // also visible in Vercel > Logs
  if (process.env.SIGNUP_WEBHOOK_URL) {
    try {
      await fetch(process.env.SIGNUP_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry), signal: AbortSignal.timeout(5000) });
    } catch (e) { console.error('society webhook error', e); }
  }
  return res.status(200).json({ ok: true, prize: entry.prize, prizeName: entry.prizeName, member: entry.member });
};
