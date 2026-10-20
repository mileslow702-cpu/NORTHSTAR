// Play stats (POST /api/track): time played, furthest level, ending, prize, per visit.
// Forwarded to SIGNUP_WEBHOOK_URL (the Google Sheet), which keeps a Sessions tab and a per-player summary.
const toSheet = require('./_sheet');
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const sessionId = clean(b.sessionId, 40), email = clean(b.email, 120).toLowerCase();
  if (!/^[a-z0-9]{8,40}$/.test(sessionId) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false });
  const now = Date.now(), started = Date.parse(b.startedAt);   // the phone's clock; trusted only within a day of ours
  const entry = {
    type: 'session', sessionId, email, name: clean(b.name, 60),
    startedAt: new Date(started && Math.abs(started - now) < 864e5 ? started : now).toISOString(),
    minutes: Math.round(num(b.minutes, 0, 1440) * 10) / 10,
    levelNum: Math.round(num(b.levelNum, 0, 6)), level: clean(b.level, 40),
    ending: clean(b.ending, 40), prize: clean(b.prize, 80), updatedAt: new Date().toISOString(),
  };
  if ((await toSheet(entry)) === 'fail') return res.status(503).json({ ok: false });   // the game keeps it and retries
  return res.status(200).json({ ok: true });
};
