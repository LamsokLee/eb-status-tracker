// Local dev server. On Vercel, api/index.js is the entry point instead.
import app from './app.js';

try { process.loadEnvFile(); } catch { /* no .env file — fine */ }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EB status tracker running at http://localhost:${PORT}`));
