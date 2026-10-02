// One-way sync: Google Sheet → Supabase. INSERT-ONLY for new rows —
// never overwrites existing entries (site edits win over sheet data).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(); } catch { /* rely on real env */ }

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1V-VTIK8_MhZfHuDb0lC9l84oia_FBqz4l5h9y6qjSTc/export?format=csv&gid=0';

const { getDb, normalizeId, STATUSES } = await import('./db.js');

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

const res = await fetch(SHEET_CSV_URL);
if (!res.ok) { console.error(`Sheet fetch failed: HTTP ${res.status}`); process.exit(1); }
const rows = parseCsv(await res.text());
rows.shift(); // header

const db = getDb();
const { data: existing, error: readErr } = await db.from('eb_entries').select('id');
if (readErr) { console.error(readErr); process.exit(1); }
const existingIds = new Set(existing.map(r => r.id));

const used = new Set(existingIds);
const newRows = [];
let skipped = 0;

for (const r of rows) {
  const [alias, category, pd, lawFirm, status, openDate, filedDate, notes] = r.map(s => (s || '').trim());
  if (!pd || !/^\d{4}-\d{2}-\d{2}$/.test(pd)) { skipped++; continue; }

  const baseId = normalizeId(alias) || `anon-${pd}`;
  if (existingIds.has(baseId)) continue; // already synced — check BEFORE any suffixing
  let id = baseId, n = 2;
  while (used.has(id)) id = `${baseId}-${n++}`; // distinct new row with colliding ID
  used.add(id);

  const cat = ['EB1', 'EB2', 'EB3'].includes(category) ? category : 'EB3';
  const st = STATUSES.includes(status) ? status : 'Case Not Opened';
  newRows.push({
    id, display_id: alias ? alias.trim().replace(/\s+/g, '-') : id, category: cat, pd,
    law_firm: lawFirm,
    status: st,
    case_open_date: /^\d{4}-\d{2}-\d{2}$/.test(openDate) ? openDate : null,
    case_filed_date: /^\d{4}-\d{2}-\d{2}$/.test(filedDate) ? filedDate : null,
    notes,
  });
}

console.log(`Sheet rows parsed. Existing in DB: ${existingIds.size}. New to insert: ${newRows.length}. Skipped (no valid PD): ${skipped}.`);
if (newRows.length) {
  for (const r of newRows) console.log(`  + ${r.id} | ${r.category} | ${r.pd} | ${r.status}`);
  const { error } = await db.from('eb_entries').insert(newRows);
  if (error) { console.error('Insert failed:', error); process.exit(1); }
  console.log(`Inserted ${newRows.length} new entries.`);
}
