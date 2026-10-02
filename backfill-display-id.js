// Backfill display_id (case-preserved) from the Google Sheet aliases.
// Replicates the original seed's ID assignment, then updates display_id
// for any row where it differs (e.g. canonical "yc" → display "YC").
// Reports sheet rows that don't map to an existing DB id instead of guessing.
try { process.loadEnvFile(); } catch { /* rely on real env */ }

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1V-VTIK8_MhZfHuDb0lC9l84oia_FBqz4l5h9y6qjSTc/export?format=csv&gid=0';

const { getDb, normalizeId } = await import('./db.js');

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

const used = new Set();
const mapping = [];
for (const r of rows) {
  const [alias, , pd] = r.map(s => (s || '').trim());
  if (!pd || !/^\d{4}-\d{2}-\d{2}$/.test(pd)) continue;
  let id = normalizeId(alias) || `anon-${pd}`;
  let base = id, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  mapping.push({ id, display: alias ? alias.trim().replace(/\s+/g, '-') : id });
}

const db = getDb();
const { data: existing, error } = await db.from('eb_entries').select('id, display_id');
if (error) { console.error(error); process.exit(1); }
const byId = new Map(existing.map(r => [r.id, r.display_id]));

let updated = 0;
const missing = [];
for (const m of mapping) {
  if (!byId.has(m.id)) { missing.push(m); continue; }
  if (byId.get(m.id) === m.display) continue;
  const { error: upErr } = await db.from('eb_entries').update({ display_id: m.display }).eq('id', m.id);
  if (upErr) { console.error(`update failed for ${m.id}:`, upErr); process.exit(1); }
  updated++;
  if (m.id !== m.display) console.log(`  ${m.id} → "${m.display}"`);
}
console.log(`display_id updated: ${updated} of ${mapping.length} rows. Unmapped sheet rows: ${missing.length}`);
if (missing.length) console.log(missing);
