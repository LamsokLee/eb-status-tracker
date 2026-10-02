# EB2/EB3 Status Tracker

Self-serve web tracker for EB2/EB3 green card case status, seeded from the
[original Google Sheet](https://docs.google.com/spreadsheets/d/1V-VTIK8_MhZfHuDb0lC9l84oia_FBqz4l5h9y6qjSTc/edit).

## How it works

- Each user picks a **unique ID** (case-insensitive, spaces become dashes).
- No login/verification — knowing the ID is enough to update the record.
- Users can create an entry and later update status, dates, and notes with their ID.
- Everyone can see the full board, sortable/filterable by category, status, firm, etc.

## Stack

- Node.js (built-in `node:sqlite`, no native deps) + Express
- Single-page frontend in `public/index.html` (no build step)
- SQLite file: `tracker.db`

## Run

```bash
npm install
node seed.js        # one-time: imports seed.csv into tracker.db (wipes existing rows)
npm start           # serves on http://localhost:3000 (PORT env to override)
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/entries` | List all entries (sorted by PD) |
| GET | `/api/entries/:id` | Get one entry |
| POST | `/api/entries` | Create (409 if ID taken) |
| PUT | `/api/entries/:id` | Update any fields |
| GET | `/api/stats` | Totals by status/category |
| GET | `/api/meta` | Valid categories/statuses |

Statuses: `Case Not Opened`, `Case Opened`, `Case Filed`, `RFE`, `Approved`, `Denied`
Categories: `EB1`, `EB2`, `EB3`

## Re-seeding from the sheet

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1V-VTIK8_MhZfHuDb0lC9l84oia_FBqz4l5h9y6qjSTc/export?format=csv&gid=0" -o seed.csv
node seed.js
```

⚠️ `seed.js` wipes `tracker.db` — don't re-run after users have added their own entries
unless you merge first.

## Deploy notes

Any Node host works (Railway, Render, Fly.io, a VPS). Needs Node ≥ 23 for `node:sqlite`.
For Vercel you'd need to swap SQLite for Postgres (e.g. Supabase) since the filesystem
is ephemeral.
