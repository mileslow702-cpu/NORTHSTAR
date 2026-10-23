// North Star game + the Do Better Arcade -> this Google Sheet.
// Tabs: Players (one row per North Star player, with totals), Sessions (one row per North Star visit),
// Society (prize winners), Arcade (one row per player per game: North Star, Need A Ride?, HOUSE RULES).
// Written in plain JavaScript that runs on both Apps Script engines (old and new), and it never asks the engine to read a
// date string (the old engine turns them into 12/31/1969). Updating it never deletes rows or moves data.
var PLAYER_COLS = ['First Seen', 'Name', 'Email', 'Visits', 'Minutes Played', 'Furthest Level', 'Beat The Game', 'Best Ending', 'Prize', 'Last Seen'];
var SESSION_COLS = ['Started', 'Name', 'Email', 'Visit #', 'Minutes Played', 'Furthest Level', 'Ending', 'Prize', 'Last Update', 'Session ID'];
var SOCIETY_COLS = ['Date', 'Name', 'Email', 'Phone', 'Texts OK', 'Prize'];
var ARCADE_COLS = ['First Seen', 'Game', 'Name', 'Email', 'Visits', 'Minutes Played', 'Progress', 'Last Seen'];
var RANK = { 'Beat Chapter 2': 4, 'Beat the game': 3, 'Signed the contract': 2, 'Game over': 1 };
var TZ = 'America/Los_Angeles';            // Las Vegas time
var DATE_FORMAT = 'm/d/yyyy h:mm am/pm';
var DATE_COLS = { Players: [1, 10], Sessions: [1, 9], Society: [1], Arcade: [1, 8] };   // column numbers
var VERSION = 'v6';

// ---- time: everything goes on the sheet as Las Vegas wall-clock time, e.g. "2026-10-23 13:45:00" ----
// toMs: a moment in milliseconds from a sheet date, a number, or an ISO time like 2026-10-23T20:45:00.000Z (0 if none)
function toMs(v) {
  if (v instanceof Date) return v.getTime() || 0;
  if (typeof v === 'number') return v > 0 ? v : 0;
  var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?(Z|([+-])(\d\d):?(\d\d))?$/.exec(String(v || ''));
  if (!m) return 0;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +((m[7] || '0') + '00').slice(0, 3));
  if (m[9]) t -= (m[9] === '-' ? -1 : 1) * (+m[10] * 60 + +m[11]) * 60000;
  return t;
}
var REAL = Date.UTC(2026, 0, 1);   // anything earlier is a broken date (like 12/31/1969)
function vegas(ms) { return ms >= REAL ? Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd HH:mm:ss') : ''; }
function at(v) { return vegas(toMs(v) || new Date().getTime()); }   // a time sent by the game (now, if it's missing)

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    setUp();
    if (d.type === 'society') {
      var so = tab('Society', SOCIETY_COLS);
      if (!rowOf(so, 3, d.email)) so.appendRow([at(d.createdAt), d.name, d.email, "'" + d.phone, d.consent ? 'Yes' : 'No', d.prizeName]);
    } else if (d.type === 'player') {
      var p = tab('Players', PLAYER_COLS);
      if (!rowOf(p, 3, d.email)) p.appendRow([at(d.createdAt), d.name, d.email, 0, 0, '', 'No', '', '', at(d.createdAt)]);
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
  var s = tab('Sessions', SESSION_COLS);
  var rows = s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, SESSION_COLS.length).getValues() : [];
  var found = -1, i;
  for (i = 0; i < rows.length; i++) if (String(rows[i][9]) === d.sessionId) { found = i; break; }
  if (found < 0) {
    var visit = 1;
    for (i = 0; i < rows.length; i++) if (String(rows[i][2]).toLowerCase() === d.email) visit++;
    var row = [at(d.startedAt), d.name, d.email, visit, d.minutes, d.level, d.ending, d.prize, at(d.updatedAt), d.sessionId];
    s.appendRow(row);
    rows.push(row);
  } else {
    var vals = [d.minutes, d.level, d.ending, d.prize, at(d.updatedAt)];
    s.getRange(found + 2, 5, 1, 5).setValues([vals]);
    for (i = 0; i < 5; i++) rows[found][4 + i] = vals[i];
  }
  // roll every visit by this person up into their Players row
  var level = '', ending = '', prize = '', minutes = 0, visits = 0;
  for (i = 0; i < rows.length; i++) {
    var x = rows[i];
    if (String(x[2]).toLowerCase() !== d.email) continue;
    visits++; minutes += Number(x[4] || 0);
    if (x[5] && (!level || parseInt(x[5], 10) > parseInt(level, 10))) level = String(x[5]);
    if (x[6] && (RANK[x[6]] || 0) >= (RANK[ending] || 0)) ending = String(x[6]);
    if (x[7]) prize = String(x[7]);
  }
  minutes = Math.round(minutes * 10) / 10;
  var summary = [visits, minutes, level, (RANK[ending] || 0) >= 3 ? 'Yes' : 'No', ending, prize, at(d.updatedAt)];
  var p = tab('Players', PLAYER_COLS);
  var pr = rowOf(p, 3, d.email);
  if (pr) p.getRange(pr, 4, 1, summary.length).setValues([summary]);
  else p.appendRow([at(d.startedAt), d.name, d.email].concat(summary));
  arcade([{ game: 'NORTH STAR', name: d.name, email: d.email, visits: visits, minutes: minutes, progress: [level, ending].filter(String).join(' · '), firstSeen: d.startedAt, lastSeen: d.updatedAt }]);
}

// One row per player per game. A newer update fills in the name, raises visits/minutes, and moves Last Seen forward.
function arcade(entries) {
  if (!entries.length) return;
  var a = tab('Arcade', ARCADE_COLS);
  var n = a.getLastRow() - 1;
  var rows = n > 0 ? a.getRange(2, 1, n, ARCADE_COLS.length).getValues() : [];
  var first = [], last = [], index = {}, fresh = [], i;
  for (i = 0; i < rows.length; i++) { first.push(toMs(rows[i][0])); last.push(toMs(rows[i][7])); index[String(rows[i][1]) + '|' + String(rows[i][3]).toLowerCase()] = i; }
  for (var k = 0; k < entries.length; k++) {
    var e = entries[k], key = e.game + '|' + String(e.email).toLowerCase();
    var seen = toMs(e.lastSeen) || new Date().getTime(), began = toMs(e.firstSeen) || seen;
    i = index[key];
    if (i === undefined) {
      index[key] = i = rows.length; fresh.push(i);
      rows.push([vegas(began), e.game, e.name || '', e.email, e.visits || 0, e.minutes || 0, e.progress || '', vegas(seen)]); first.push(began); last.push(seen);
      continue;
    }
    var r = rows[i], newer = !last[i] || seen >= last[i];   // an older update arriving late never rolls progress back
    if (!first[i] || began < first[i]) { first[i] = began; r[0] = vegas(began); }
    r[2] = e.name || r[2]; r[4] = Math.max(Number(r[4]) || 0, e.visits || 0); r[5] = Math.max(Number(r[5]) || 0, e.minutes || 0);
    if (newer) { r[6] = e.progress || r[6]; r[7] = vegas(seen); last[i] = seen; }
    if (i < n) a.getRange(i + 2, 1, 1, ARCADE_COLS.length).setValues([[vegas(first[i]) || r[0], r[1], r[2], r[3], r[4], r[5], r[6], vegas(last[i]) || r[7]]]);
  }
  if (fresh.length) a.getRange(n + 2, 1, fresh.length, ARCADE_COLS.length).setValues(fresh.map(function (j) { return rows[j]; }));
}

// Once per version: put the sheet on Las Vegas time and fix every time already on it.
// - good times are rewritten as Las Vegas time
// - broken ones (12/31/1969) are rebuilt from the Session IDs, which carry the exact moment each play session began
// - copies every North Star player into the Arcade tab. Nothing is deleted.
function setUp() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('setup') === VERSION) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var P = tab('Players', PLAYER_COLS), S = tab('Sessions', SESSION_COLS), So = tab('Society', SOCIETY_COLS), A = tab('Arcade', ARCADE_COLS);
  var grab = function (t, w) { return t.getLastRow() > 1 ? t.getRange(2, 1, t.getLastRow() - 1, w).getValues() : []; };
  var ps = grab(P, PLAYER_COLS.length), ses = grab(S, SESSION_COLS.length), soc = grab(So, SOCIETY_COLS.length), arc = grab(A, ARCADE_COLS.length);
  // The first version of this script filed every play-stats update as a Society row with no phone, no prize and no time
  // (12/31/1969). Real Society members always have a phone. Keep those; move the stray rows that name a player to an
  // "Old Visits" tab (their name and email are kept), and drop the ones that carry nothing at all.
  var blank = function (v) { var t = String(v === undefined || v === null ? '' : v).replace(/^'/, ''); return t === '' || t === 'undefined' || t === 'null'; };
  var members = [], stray = [];
  soc.forEach(function (r) {
    if (!blank(r[3])) members.push(r);
    else if (!blank(r[2]) && String(r[2]).indexOf('@') > 0) stray.push([vegas(toMs(r[0])) || '', blank(r[1]) ? '' : r[1], r[2], 'Play visit filed by the first sheet script (no time was recorded)']);
  });
  if (members.length !== soc.length) {
    So.getRange(2, 1, soc.length, SOCIETY_COLS.length).clearContent();
    if (members.length) So.getRange(2, 1, members.length, SOCIETY_COLS.length).setValues(members);
    if (stray.length) { var O = tab('Old Visits', ['Date', 'Name', 'Email', 'Note']); O.getRange(O.getLastRow() + 1, 1, stray.length, 4).setValues(stray); }
    soc = members;
  }
  var good = function (v) { var t = toMs(v); return t >= REAL ? t : 0; };
  // what the play sessions say about each person: first start, last activity, when they beat the game
  var who = {};
  for (var i = 0; i < ses.length; i++) {
    var x = ses[i], id = String(x[9] || ''), email = String(x[2]).toLowerCase();
    var start = good(x[0]) || (/^[0-9a-z]{8}/.test(id) ? parseInt(id.slice(0, 8), 36) : 0);
    if (start < REAL || start > new Date().getTime() + 864e5) start = 0;
    var end = good(x[8]) || (start ? start + Math.round(Number(x[4] || 0) * 60000) : 0);
    x[0] = start || x[0]; x[8] = end || x[8];
    var w = who[email] = who[email] || { first: 0, last: 0, won: 0 };
    if (start && (!w.first || start < w.first)) w.first = start;
    if (end > w.last) w.last = end;
    if (end && (RANK[x[6]] || 0) >= 3 && (!w.won || end < w.won)) w.won = end;
  }
  var fix = function (v, guess) { return vegas(good(v) || guess || 0) || v; };   // keep the cell as it was if nothing better is known
  ses.forEach(function (x) { x[0] = fix(x[0]); x[8] = fix(x[8]); });
  var seen = {};   // each North Star player's real first and last time, for the Arcade tab
  ps.forEach(function (x) {
    var w = who[String(x[2]).toLowerCase()] || {}, f = good(x[0]) || w.first || 0, l = good(x[9]) || w.last || f;
    seen[String(x[2]).toLowerCase()] = { first: w.first && f ? Math.min(f, w.first) : f, last: Math.max(l, w.last || 0) };
    x[0] = fix(x[0], w.first); x[9] = fix(x[9], w.last);
  });
  soc.forEach(function (x) { var w = who[String(x[2]).toLowerCase()] || {}; x[0] = fix(x[0], w.won || w.last); });
  arc.forEach(function (x) { x[0] = fix(x[0]); x[7] = fix(x[7]); });
  ss.setSpreadsheetTimeZone(TZ);
  var put = function (t, rows, cols) { cols.forEach(function (c) { if (rows.length) t.getRange(2, c, rows.length, 1).setValues(rows.map(function (r) { return [r[c - 1]]; })); }); };
  put(P, ps, DATE_COLS.Players); put(S, ses, DATE_COLS.Sessions); put(So, soc, DATE_COLS.Society); put(A, arc, DATE_COLS.Arcade);
  [[P, DATE_COLS.Players], [S, DATE_COLS.Sessions], [So, DATE_COLS.Society], [A, DATE_COLS.Arcade]].forEach(function (tc) {
    tc[1].forEach(function (c) { tc[0].getRange(1, c, tc[0].getMaxRows(), 1).setNumberFormat(DATE_FORMAT); });
  });
  if (!props.getProperty('arcade')) {   // first time with the Arcade tab: bring every North Star player in
    arcade(ps.filter(function (r) { return r[2]; }).map(function (r) {
      var w = seen[String(r[2]).toLowerCase()] || {};
      return { game: 'NORTH STAR', name: r[1], email: String(r[2]).toLowerCase(), visits: Number(r[3]) || 0, minutes: Number(r[4]) || 0,
        progress: [r[5], r[7]].filter(String).join(' · '), firstSeen: w.first || 0, lastSeen: w.last || w.first || 0 };
    }));
    props.setProperty('arcade', 'yes');
  }
  props.setProperty('setup', VERSION);
}

function tab(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var t = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = t.getRange(1, 1, 1, cols.length);
  if (head.getValues()[0].join('|') !== cols.join('|')) { head.setValues([cols]).setFontWeight('bold'); t.setFrozenRows(1); }
  return t;
}

function rowOf(t, col, value) {   // sheet row where this column matches (ignoring case), or 0
  if (t.getLastRow() < 2) return 0;
  var vals = t.getRange(2, col, t.getLastRow() - 1, 1).getValues();
  var v = String(value).toLowerCase();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).toLowerCase() === v) return i + 2;
  return 0;
}
