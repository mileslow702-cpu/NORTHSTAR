// North Star game -> this Google Sheet.
// Tabs: Players (one row per person, with totals), Sessions (one row per visit), Society (prize winners).
const PLAYER_COLS = ['First Seen', 'Name', 'Email', 'Visits', 'Minutes Played', 'Furthest Level', 'Beat The Game', 'Best Ending', 'Prize', 'Last Seen'];
const SESSION_COLS = ['Started', 'Name', 'Email', 'Visit #', 'Minutes Played', 'Furthest Level', 'Ending', 'Prize', 'Last Update', 'Session ID'];
const SOCIETY_COLS = ['Date', 'Name', 'Email', 'Phone', 'Texts OK', 'Prize'];
const RANK = { 'Beat the game': 3, 'Signed the contract': 2, 'Game over': 1 };

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.type === 'society') {
      tab('Society', SOCIETY_COLS).appendRow([new Date(d.createdAt), d.name, d.email, "'" + d.phone, d.consent ? 'Yes' : 'No', d.prizeName]);
    } else if (d.type === 'player') {
      const p = tab('Players', PLAYER_COLS);
      if (!rowOf(p, 3, d.email)) p.appendRow([new Date(d.createdAt), d.name, d.email, 0, 0, '', 'No', '', '', new Date(d.createdAt)]);
    } else if (d.type === 'session') {
      session(d);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

function session(d) {
  const s = tab('Sessions', SESSION_COLS);
  const rows = s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, SESSION_COLS.length).getValues() : [];
  const at = rows.findIndex(x => String(x[9]) === d.sessionId);
  if (at < 0) {
    const visit = rows.filter(x => String(x[2]).toLowerCase() === d.email).length + 1;
    const row = [new Date(d.startedAt), d.name, d.email, visit, d.minutes, d.level, d.ending, d.prize, new Date(d.updatedAt), d.sessionId];
    s.appendRow(row);
    rows.push(row);
  } else {
    const vals = [d.minutes, d.level, d.ending, d.prize, new Date(d.updatedAt)];
    s.getRange(at + 2, 5, 1, 5).setValues([vals]);
    rows[at].splice(4, 5, ...vals);
  }
  // roll every visit by this person up into their Players row
  const mine = rows.filter(x => String(x[2]).toLowerCase() === d.email);
  const level = mine.map(x => String(x[5])).filter(Boolean).sort((a, b) => parseInt(b) - parseInt(a))[0] || '';
  const ending = mine.map(x => String(x[6])).filter(Boolean).sort((a, b) => (RANK[b] || 0) - (RANK[a] || 0))[0] || '';
  const prize = mine.map(x => String(x[7])).filter(Boolean).pop() || '';
  const minutes = Math.round(mine.reduce((a, x) => a + Number(x[4] || 0), 0) * 10) / 10;
  const summary = [mine.length, minutes, level, ending === 'Beat the game' ? 'Yes' : 'No', ending, prize, new Date(d.updatedAt)];
  const p = tab('Players', PLAYER_COLS);
  const pr = rowOf(p, 3, d.email);
  if (pr) p.getRange(pr, 4, 1, summary.length).setValues([summary]);
  else p.appendRow([new Date(d.startedAt), d.name, d.email].concat(summary));
}

function tab(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const t = ss.getSheetByName(name) || ss.insertSheet(name);
  const head = t.getRange(1, 1, 1, cols.length);
  if (head.getValues()[0].join('|') !== cols.join('|')) { head.setValues([cols]).setFontWeight('bold'); t.setFrozenRows(1); }
  return t;
}

function rowOf(t, col, value) {   // sheet row where this column matches (ignoring case), or 0
  if (t.getLastRow() < 2) return 0;
  const vals = t.getRange(2, col, t.getLastRow() - 1, 1).getValues();
  const v = String(value).toLowerCase();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).toLowerCase() === v) return i + 2;
  return 0;
}
