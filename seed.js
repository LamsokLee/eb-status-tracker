// One-time seed from the Google Sheet CSV export (seed.csv).
// Empty aliases get a generated ID like anon-2022-01-06-2.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, normalizeId, STATUSES } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'seed.csv');

// Minimal CSV parser handling quoted fields.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const header = rows.shift();
console.log('Header:', header.join(' | '));

const db = openDb();
db.exec('DELETE FROM entries');

const insert = db.prepare(`
  INSERT INTO entries (id, category, pd, law_firm, status, case_open_date, case_filed_date, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const used = new Set();
let seeded = 0, skipped = 0;

for (const r of rows) {
  const [alias, category, pd, lawFirm, status, openDate, filedDate, notes] = r.map(s => (s || '').trim());
  if (!pd || !/^\d{4}-\d{2}-\d{2}$/.test(pd)) { skipped++; continue; }

  let id = normalizeId(alias) || `anon-${pd}`;
  let base = id, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);

  const cat = ['EB1', 'EB2', 'EB3'].includes(category) ? category : 'EB3';
  const st = STATUSES.includes(status) ? status : 'Case Not Opened';
  insert.run(id, cat, pd, lawFirm, st,
    /^\d{4}-\d{2}-\d{2}$/.test(openDate) ? openDate : '',
    /^\d{4}-\d{2}-\d{2}$/.test(filedDate) ? filedDate : '',
    notes);
  seeded++;
}
console.log(`Seeded ${seeded} entries (${skipped} rows skipped).`);
