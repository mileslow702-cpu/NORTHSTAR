// North Star game sign-ups -> this Google Sheet.
// "Players" tab: everyone who signed in to play. "Society" tab: North Star Society members and their prizes.
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const player = d.type === 'player';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tab = ss.getSheetByName(player ? 'Players' : 'Society') || ss.insertSheet(player ? 'Players' : 'Society');
  if (tab.getLastRow() === 0) tab.appendRow(player ? ['Date', 'Name', 'Email'] : ['Date', 'Name', 'Email', 'Phone', 'Texts OK', 'Prize']);
  const when = new Date(d.createdAt);
  tab.appendRow(player ? [when, d.name, d.email] : [when, d.name, d.email, "'" + d.phone, d.consent ? 'Yes' : 'No', d.prizeName]);
  return ContentService.createTextOutput('ok');
}
