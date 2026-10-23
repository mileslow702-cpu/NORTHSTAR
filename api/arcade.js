// The Do Better Arcade on the North Star sheet (POST /api/arcade): Miles's other games (Need A Ride?, HOUSE RULES)
// send their players here, and they land on the sheet's Arcade tab next to North Star. Same Google Sheet webhook.
// Body: one player { game, email, name, visits, minutes, progress, firstSeen, lastSeen } or { entries: [ ...players ] }.
const toSheet = require('./_sheet');

const GAMES = { 'need-a-ride': 'NEED A RIDE?', 'house-rules': 'HOUSE RULES' };
const ORIGINS = [/^https:\/\/need-a-ride[\w-]*\.vercel\.app$/, /^https:\/\/house-rules[\w-]*\.vercel\.app$/];
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
const when = (v, now) => { const t = Number(v) || Date.parse(v); return t && t > Date.parse('2026-01-01') && t < now + 864e5 ? new Date(t).toISOString() : new Date(now).toISOString(); };

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ORIGINS.some(r => r.test(origin))) {   // the games call this from their own sites
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const now = Date.now();
  const entries = (Array.isArray(b.entries) ? b.entries.slice(0, 500) : [b]).map(e => e || {}).map(e => {
    const lastSeen = when(e.lastSeen, now);
    return {
      game: GAMES[e.game] || '', email: clean(e.email, 120).toLowerCase(), name: clean(e.name, 60),
      visits: Math.round(num(e.visits, 0, 100000)), minutes: Math.round(num(e.minutes, 0, 1e6) * 10) / 10,
      progress: clean(e.progress, 120), firstSeen: e.firstSeen ? when(e.firstSeen, now) : lastSeen, lastSeen,
    };
  }).filter(e => e.game && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.email));
  if (!entries.length) return res.status(400).json({ ok: false });
  if ((await toSheet({ type: 'arcade', entries }, 'ok arcade')) === 'fail') return res.status(503).json({ ok: false });   // the game keeps it and retries (also until the sheet script that knows the Arcade tab is deployed)
  return res.status(200).json({ ok: true, saved: entries.length });
};
