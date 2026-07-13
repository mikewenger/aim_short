const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// On Railway attach a Volume at /data; locally falls back to ./data
const DATA_DIR        = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORTFOLIOS_FILE = path.join(DATA_DIR, 'portfolios.json');

// Ensure storage directory and file exist
if (!fs.existsSync(DATA_DIR))        fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PORTFOLIOS_FILE)) fs.writeFileSync(PORTFOLIOS_FILE, '{}', 'utf8');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// GET all portfolios
app.get('/api/portfolios', (req, res) => {
  try {
    const raw = fs.readFileSync(PORTFOLIOS_FILE, 'utf8');
    res.json(JSON.parse(raw || '{}'));
  } catch (e) {
    res.json({});
  }
});

// POST (overwrite) all portfolios
app.post('/api/portfolios', (req, res) => {
  try {
    fs.writeFileSync(PORTFOLIOS_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SEC EDGAR PROXY
// ============================================================
// SEC's full-text-search and XBRL APIs don't send CORS headers, so the
// browser can't call them directly from a page hosted elsewhere (e.g.
// GitHub Pages). These routes proxy those two endpoints server-side —
// same-origin from the browser's point of view, no CORS involved.
// Only works when this server is actually running (npm start); the static
// GitHub Pages deployment has no server, so the dilution screener's SEC
// calls will fail there and the page says so.
const SEC_USER_AGENT = 'AIM-Short-DilutionScreener mike@mikewenger.us';

// SEC's endpoints occasionally return a transient 5xx under load; one quiet
// retry smooths that over instead of surfacing it as a hard failure.
async function fetchSecWithRetry(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const secRes = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
    if (secRes.status < 500 || attempt === 1) return secRes;
    await new Promise(r => setTimeout(r, 400));
  }
}

app.get('/api/edgar/search', async (req, res) => {
  const allowed = ['forms', 'startdt', 'enddt', 'ciks', 'q', 'from'];
  const params = new URLSearchParams();
  for (const key of allowed) {
    if (req.query[key] !== undefined) params.set(key, String(req.query[key]));
  }
  const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
  try {
    const secRes = await fetchSecWithRetry(url);
    const body = await secRes.text();
    res.status(secRes.status).type('application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'EDGAR search proxy failed: ' + e.message });
  }
});

app.get('/api/edgar/companyfacts/:cik', async (req, res) => {
  const digits = String(req.params.cik).replace(/\D/g, '');
  if (!digits) { res.status(400).json({ error: 'Invalid CIK' }); return; }
  const cik10 = digits.padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
  try {
    const secRes = await fetchSecWithRetry(url);
    const body = await secRes.text();
    res.status(secRes.status).type('application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'EDGAR companyfacts proxy failed: ' + e.message });
  }
});

// Catch-all: serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`AIM Tracker running on port ${PORT}`));
