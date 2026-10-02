// Seed Supabase from the Google Sheet CSV export (seed.csv).
// Uses upsert so it's safe to re-run. Requires SUPABASE_URL / SUPABASE_ANON_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(); } catch { /* rely on real env */ }

const { getDb, normalizeId, STATUSES } = await import('./db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'seed.csv');

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
rows.shift(); // header

const used = new Set();
const payload = [];
let skipped = 0;

for (const r of rows) {
  const [alias, category, pd, lawFirm, status, openDate, filedDate, notes] = r.map(s => (s || '').trim());
  if (!pd || !/^\d{4}-\d{2}-\d{2}$/.test(pd)) { skipped++; continue; }

  let id = normalizeId(alias) || `anon-${pd}`;
  let base = id, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);

  const cat = ['EB1', 'EB2', 'EB3'].includes(category) ? category : 'EB3';
  const st = STATUSES.includes(status) ? status : 'Case Not Opened';
  payload.push({
    id, display_id: alias ? alias.trim().replace(/\s+/g, '-') : id, category: cat, pd,
    law_firm: lawFirm,
    status: st,
    case_open_date: /^\d{4}-\d{2}-\d{2}$/.test(openDate) ? openDate : null,
    case_filed_date: /^\d{4}-\d{2}-\d{2}$/.test(filedDate) ? filedDate : null,
    notes,
  });
}

const { error } = await getDb().from('eb_entries').upsert(payload, { onConflict: 'id' });
if (error) { console.error('Seed failed:', error); process.exit(1); }
console.log(`Seeded ${payload.length} entries (${skipped} rows skipped).`);
