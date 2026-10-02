// Supabase-backed data layer. Public anon key + RLS policies allow
// read/insert/update for everyone (by design — no auth in this app);
// all validation still happens server-side in app.js.
import { createClient } from '@supabase/supabase-js';

export const CATEGORIES = ['EB1', 'EB2', 'EB3'];
export const LAW_FIRMS = ['Fragomen', 'BAL', 'Ogletree Deakins', 'Other - (add to notes)'];
export const STATUSES = [
  'Case Not Opened',
  'Case Opened',
  'Case Filed',
  'RFE',
  'Approved',
  'Denied',
];

const TABLE = 'eb_entries';
let client;

export function getDb() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY env vars are required');
    client = createClient(url, key);
  }
  return client;
}

// Canonical ID (lookup/uniqueness key): trim, lowercase, whitespace → '-'.
// Uniqueness is enforced by the PRIMARY KEY, so IDs are case-insensitive.
export function normalizeId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '-');
}

// Display ID: same normalization but case-preserved, purely for showing.
export function displayIdFrom(raw) {
  return String(raw || '').trim().replace(/\s+/g, '-');
}

// Validate + normalize an API payload. partial=true → only provided fields.
export function validateEntry(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) {
      errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
    } else out.category = body.category;
  }
  if (!partial || body.pd !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.pd || '')) {
      errors.push('pd must be a date YYYY-MM-DD');
    } else out.pd = body.pd;
  }
  const optDate = (key) => {
    if (partial && body[key] === undefined) return;
    const v = body[key] || '';
    if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      errors.push(`${key} must be YYYY-MM-DD or empty`);
    } else out[key] = v;
  };
  optDate('caseOpenDate');
  optDate('caseFiledDate');
  optDate('decisionDate');

  if (!partial || body.lawFirm !== undefined) {
    if (!LAW_FIRMS.includes(body.lawFirm)) {
      errors.push(`lawFirm must be one of: ${LAW_FIRMS.join(', ')}`);
    } else out.lawFirm = body.lawFirm;
  }
  if (!partial || body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${STATUSES.join(', ')}`);
    } else out.status = body.status;
  }
  if (!partial || body.notes !== undefined) {
    out.notes = String(body.notes || '').trim().slice(0, 2000);
  }
  return { errors, values: out };
}

// DB rows use NULL for empty dates; API uses ''.
const toRow = (v) => ({
  id: v.id,
  display_id: v.displayId ?? v.id,
  category: v.category,
  pd: v.pd,
  law_firm: v.lawFirm ?? '',
  status: v.status,
  case_open_date: v.caseOpenDate || null,
  case_filed_date: v.caseFiledDate || null,
  decision_date: v.decisionDate || null,
  notes: v.notes ?? '',
});

export const fromRow = (r) => ({
  id: r.id,
  displayId: r.display_id || r.id,
  category: r.category,
  pd: r.pd,
  lawFirm: r.law_firm,
  status: r.status,
  caseOpenDate: r.case_open_date || '',
  caseFiledDate: r.case_filed_date || '',
  decisionDate: r.decision_date || '',
  notes: r.notes,
  updatedAt: String(r.updated_at || '').replace('T', ' ').slice(0, 19),
});

export async function listEntries() {
  const { data, error } = await getDb().from(TABLE).select('*').order('pd').order('id');
  if (error) throw error;
  return data.map(fromRow);
}

export async function getEntry(id) {
  const { data, error } = await getDb().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

// Returns 'duplicate' on ID conflict.
export async function createEntry(values) {
  const { error } = await getDb().from(TABLE).insert(toRow(values));
  if (error) {
    if (error.code === '23505') return 'duplicate';
    throw error;
  }
  return null;
}

// Returns false if no row matched the ID.
export async function updateEntry(id, values) {
  const colMap = {
    category: 'category', pd: 'pd', lawFirm: 'law_firm', status: 'status',
    caseOpenDate: 'case_open_date', caseFiledDate: 'case_filed_date',
    decisionDate: 'decision_date', notes: 'notes',
  };
  const row = {};
  for (const [k, v] of Object.entries(values)) {
    row[colMap[k]] = k.endsWith('Date') ? (v || null) : v;
  }
  row.updated_at = new Date().toISOString();
  const { data, error } = await getDb().from(TABLE).update(row).eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

export async function getStats() {
  const { data, error } = await getDb().from(TABLE).select('status,category');
  if (error) throw error;
  const byStatus = {}, byCategory = {};
  for (const r of data) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }
  return { total: data.length, byStatus, byCategory };
}
