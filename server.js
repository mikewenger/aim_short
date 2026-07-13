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

// Catch-all: serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`AIM Tracker running on port ${PORT}`));
