// Sends one record to the Google Sheet (SIGNUP_WEBHOOK_URL). Files starting with "_" are helpers, not web routes.
// 'ok'  = the sheet script answered "ok" (the row is saved)
// 'fail' = the sheet didn't confirm, so the caller reports an error and the game tries again later
// 'off' = no sheet configured
module.exports = async function toSheet(entry) {
  const url = process.env.SIGNUP_WEBHOOK_URL;
  if (!url) return 'off';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry), signal: AbortSignal.timeout(9000) });
    const text = (await r.text()).trim();
    if (text === 'ok') return 'ok';
    console.error('sheet did not confirm', r.status, text.slice(0, 300));
  } catch (e) { console.error('sheet unreachable', e.message); }
  return 'fail';
};
