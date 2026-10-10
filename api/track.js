// Play stats (POST /api/track): time played, furthest level, ending, prize, per visit.
// Forwarded to SIGNUP_WEBHOOK_URL (the Google Sheet), which keeps a Sessions tab and a per-player summary.
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
  const started = new Date(b.startedAt);
  const entry = {
    type: 'session', sessionId, email, name: clean(b.name, 60),
    startedAt: isNaN(started) ? new Date().toISOString() : started.toISOString(),
    minutes: Math.round(num(b.minutes, 0, 1440) * 10) / 10,
    levelNum: Math.round(num(b.levelNum, 0, 6)), level: clean(b.level, 40),
    ending: clean(b.ending, 40), prize: clean(b.prize, 80), updatedAt: new Date().toISOString(),
  };
  if (process.env.SIGNUP_WEBHOOK_URL) {
    try { await fetch(process.env.SIGNUP_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry), signal: AbortSignal.timeout(8000) }); }
    catch (e) { console.error('track webhook error', e); }
  }
  return res.status(200).json({ ok: true });
};
