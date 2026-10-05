import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listEntries, getEntry, createEntry, updateEntry, listHistory, getStats,
  normalizeId, displayIdFrom, validateEntry, CATEGORIES, STATUSES, LAW_FIRMS,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Metadata for form dropdowns
app.get('/api/meta', (_req, res) => {
  res.json({ categories: CATEGORIES, statuses: STATUSES, lawFirms: LAW_FIRMS });
});

// List all entries, sorted by priority date
app.get('/api/entries', async (_req, res, next) => {
  try {
    res.json({ entries: await listEntries() });
  } catch (e) { next(e); }
});

// Get one entry (used by the update form)
app.get('/api/entries/:id', async (req, res, next) => {
  try {
    const id = normalizeId(req.params.id);
    const entry = await getEntry(id);
    if (!entry) return res.status(404).json({ error: `No entry found for ID "${id}"` });
    res.json(entry);
  } catch (e) { next(e); }
});

// Audit trail for one entry (newest first)
app.get('/api/entries/:id/history', async (req, res, next) => {
  try {
    const id = normalizeId(req.params.id);
    res.json({ entry: id, history: await listHistory(id) });
  } catch (e) { next(e); }
});

// Create a new entry — ID must be unique
app.post('/api/entries', async (req, res, next) => {
  try {
    const id = normalizeId(req.body.id);
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!/^\w[\w.-]{1,23}$/.test(id)) {
      return res.status(400).json({ error: 'id must be 2–24 chars: letters, numbers, dash, dot, underscore' });
    }

    const { errors, values } = validateEntry(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const conflict = await createEntry({ ...values, id, displayId: displayIdFrom(req.body.id) });
    if (conflict === 'duplicate') {
      return res.status(409).json({ error: `ID "${id}" is already taken — pick another one` });
    }
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});

// Update an existing entry (no auth — knowing the ID is enough, per requirements)
app.put('/api/entries/:id', async (req, res, next) => {
  try {
    const id = normalizeId(req.params.id);
    const { errors, values } = validateEntry(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    if (!Object.keys(values).length) return res.status(400).json({ error: 'nothing to update' });

    const found = await updateEntry(id, values);
    if (!found) return res.status(404).json({ error: `No entry found for ID "${id}"` });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

// Summary stats
app.get('/api/stats', async (_req, res, next) => {
  try {
    res.json(await getStats());
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

export default app;
