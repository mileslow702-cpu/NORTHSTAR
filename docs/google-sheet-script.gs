// North Star game + the Do Better Arcade -> this Google Sheet.
// Tabs: Players (one row per North Star player, with totals), Sessions (one row per North Star visit),
// Society (prize winners), Arcade (one row per player per game: North Star, Need A Ride?, HOUSE RULES).
// Updating this script never touches rows already on the sheet: it only adds the Arcade tab and keeps it filled.
const PLAYER_COLS = ['First Seen', 'Name', 'Email', 'Visits', 'Minutes Played', 'Furthest Level', 'Beat The Game', 'Best Ending', 'Prize', 'Last Seen'];
const SESSION_COLS = ['Started', 'Name', 'Email', 'Visit #', 'Minutes Played', 'Furthest Level', 'Ending', 'Prize', 'Last Update', 'Session ID'];
const SOCIETY_COLS = ['Date', 'Name', 'Email', 'Phone', 'Texts OK', 'Prize'];
const ARCADE_COLS = ['First Seen', 'Game', 'Name', 'Email', 'Visits', 'Minutes Played', 'Progress', 'Last Seen'];
const RANK = { 'Beat Chapter 2': 4, 'Beat the game': 3, 'Signed the contract': 2, 'Game over': 1 };
const TZ = 'America/Los_Angeles';            // Las Vegas time
const DATE_FORMAT = 'm/d/yyyy h:mm am/pm';
const DATE_COLS = { Players: ['A', 'J'], Sessions: ['A', 'I'], Society: ['A'], Arcade: ['A', 'H'] };

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    setUp();
    if (d.type === 'society') {
      const so = tab('Society', SOCIETY_COLS);
      if (!rowOf(so, 3, d.email)) so.appendRow([new Date(d.createdAt), d.name, d.email, "'" + d.phone, d.consent ? 'Yes' : 'No', d.prizeName]);
    } else if (d.type === 'player') {
      const p = tab('Players', PLAYER_COLS);
      if (!rowOf(p, 3, d.email)) p.appendRow([new Date(d.createdAt), d.name, d.email, 0, 0, '', 'No', '', '', new Date(d.createdAt)]);
      arcade([{ game: 'NORTH STAR', name: d.name, email: d.email, visits: 0, minutes: 0, progress: 'Signed in', firstSeen: d.createdAt, lastSeen: d.createdAt }]);
    } else if (d.type === 'session') {
      session(d);
    } else if (d.type === 'arcade') {
      arcade(d.entries || []);
      return ContentService.createTextOutput('ok arcade');
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
  const summary = [mine.length, minutes, level, (RANK[ending] || 0) >= 3 ? 'Yes' : 'No', ending, prize, new Date(d.updatedAt)];
  const p = tab('Players', PLAYER_COLS);
  const pr = rowOf(p, 3, d.email);
  if (pr) p.getRange(pr, 4, 1, summary.length).setValues([summary]);
  else p.appendRow([new Date(d.startedAt), d.name, d.email].concat(summary));
  arcade([{ game: 'NORTH STAR', name: d.name, email: d.email, visits: mine.length, minutes: minutes, progress: [level, ending].filter(Boolean).join(' · '), firstSeen: d.startedAt, lastSeen: d.updatedAt }]);
}

// One row per player per game. A newer update fills in the name, raises visits/minutes, and moves Last Seen forward.
function arcade(entries) {
  if (!entries.length) return;
  const a = tab('Arcade', ARCADE_COLS);
  const n = a.getLastRow() - 1;
  const rows = n > 0 ? a.getRange(2, 1, n, ARCADE_COLS.length).getValues() : [];
  const index = {};
  rows.forEach((r, i) => { index[String(r[1]) + '|' + String(r[3]).toLowerCase()] = i; });
  const added = [];
  entries.forEach(e => {
    const key = e.game + '|' + String(e.email).toLowerCase();
    const last = new Date(e.lastSeen || Date.now());
    if (index[key] === undefined) {
      const row = [new Date(e.firstSeen || e.lastSeen || Date.now()), e.game, e.name || '', e.email, e.visits || 0, e.minutes || 0, e.progress || '', last];
      index[key] = rows.length; rows.push(row); added.push(row);
    } else {
      const i = index[key], r = rows[i];
      const first = r[0] instanceof Date && e.firstSeen && new Date(e.firstSeen) < r[0] ? new Date(e.firstSeen) : r[0];
      const newer = !(r[7] instanceof Date) || last >= r[7];   // an older update arriving late never rolls progress back
      const upd = [first, r[1], e.name || r[2], r[3], Math.max(Number(r[4]) || 0, e.visits || 0), Math.max(Number(r[5]) || 0, e.minutes || 0), newer && e.progress ? e.progress : r[6], newer ? last : r[7]];
      rows[i] = upd;
      if (i < n) a.getRange(i + 2, 1, 1, ARCADE_COLS.length).setValues([upd]);
      else added[added.indexOf(r)] = upd;
    }
  });
  if (added.length) a.getRange(a.getLastRow() + 1, 1, added.length, ARCADE_COLS.length).setValues(added);
}

// Once per version: put the sheet on Las Vegas time, show dates like 10/20/2026 3:45 pm,
// and copy every North Star player already on the sheet into the new Arcade tab (nothing is moved or deleted).
function setUp() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('setup') === 'v4') return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  tab('Players', PLAYER_COLS); tab('Sessions', SESSION_COLS); tab('Society', SOCIETY_COLS); tab('Arcade', ARCADE_COLS);
  for (const name in DATE_COLS) DATE_COLS[name].forEach(c => ss.getSheetByName(name).getRange(c + ':' + c).setNumberFormat(DATE_FORMAT));
  const p = ss.getSheetByName('Players');
  if (p.getLastRow() > 1) arcade(p.getRange(2, 1, p.getLastRow() - 1, PLAYER_COLS.length).getValues().filter(r => r[2]).map(r => ({
    game: 'NORTH STAR', name: r[1], email: String(r[2]).toLowerCase(), visits: Number(r[3]) || 0, minutes: Number(r[4]) || 0,
    progress: [r[5], r[7]].filter(Boolean).join(' · '), firstSeen: r[0], lastSeen: r[9] || r[0],
  })));
  props.setProperty('setup', 'v4');
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
