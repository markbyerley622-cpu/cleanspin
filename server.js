require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || '';
const SHOPIFY_VARIANTS = {
  single: process.env.SHOPIFY_VARIANT_SINGLE || '',
  double: process.env.SHOPIFY_VARIANT_DOUBLE || '',
  triple: process.env.SHOPIFY_VARIANT_TRIPLE || '',
};
const SHOPIFY_DISCOUNT = process.env.SHOPIFY_DISCOUNT_CODE || '';

// On Vercel only /tmp is writable; locally we keep events under ./data
const DATA_DIR = process.env.VERCEL ? '/tmp/cleanspin' : path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '');
} catch (e) {
  console.warn('events log unavailable:', e.message);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos'), { maxAge: '7d' }));

app.get('/api/config', (_req, res) => {
  res.json({
    shopifyDomain: SHOPIFY_DOMAIN,
    variants: SHOPIFY_VARIANTS,
    discount: SHOPIFY_DISCOUNT,
  });
});

const ALLOWED_EVENTS = new Set([
  'page_view',
  'click_buy',
  'add_to_cart',
  'begin_checkout',
  'select_bundle',
  'video_play',
  'faq_open',
]);

app.post('/api/track', (req, res) => {
  const { event, props = {} } = req.body || {};
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ ok: false, error: 'invalid_event' });
  }
  const entry = {
    ts: new Date().toISOString(),
    event,
    props,
    ua: req.headers['user-agent'] || '',
    ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim(),
  };
  fs.appendFile(EVENTS_FILE, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.warn('append failed:', err.message);
    res.json({ ok: true });
  });
});

function readEvents() {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return [];
    return fs
      .readFileSync(EVENTS_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch (e) {
    console.warn('readEvents failed:', e.message);
    return [];
  }
}

app.get('/api/metrics.json', (_req, res) => {
  const events = readEvents();
  const counts = events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});
  const pageViews = counts.page_view || 0;
  const buyClicks = counts.click_buy || 0;
  const beginCheckouts = counts.begin_checkout || 0;
  res.json({
    totals: counts,
    pageViews,
    buyClicks,
    beginCheckouts,
    buyCTR: pageViews ? +(buyClicks / pageViews * 100).toFixed(2) : 0,
    checkoutCTR: pageViews ? +(beginCheckouts / pageViews * 100).toFixed(2) : 0,
    eventsLogged: events.length,
  });
});

// Prometheus exposition format — scrape with Prometheus, visualize in Grafana.
app.get('/metrics', (_req, res) => {
  const events = readEvents();
  const counts = events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});
  const lines = [];
  lines.push('# HELP store_events_total Count of tracked events by name');
  lines.push('# TYPE store_events_total counter');
  for (const [name, count] of Object.entries(counts)) {
    lines.push(`store_events_total{event="${name}"} ${count}`);
  }
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n') + '\n');
});

app.get('/admin/metrics', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`CleanSpin running on ${PUBLIC_URL}`);
    console.log(`Shopify: ${SHOPIFY_DOMAIN || 'NOT CONFIGURED — set SHOPIFY_DOMAIN'}`);
    console.log(`Variants: single=${SHOPIFY_VARIANTS.single || '—'} double=${SHOPIFY_VARIANTS.double || '—'} triple=${SHOPIFY_VARIANTS.triple || '—'}`);
    console.log(`Metrics:  ${PUBLIC_URL}/metrics  (Prometheus)`);
    console.log(`Dashboard: ${PUBLIC_URL}/admin/metrics`);
  });
}

module.exports = app;
