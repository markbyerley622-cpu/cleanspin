require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '923341271461';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey && stripeKey.startsWith('sk_')
  ? require('stripe')(stripeKey)
  : null;

const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos'), { maxAge: '7d' }));

app.get('/api/config', (_req, res) => {
  res.json({
    whatsappNumber: WHATSAPP_NUMBER,
    whatsappMessage: 'I want to order Electric Spin Cleaning Brush',
    stripeEnabled: Boolean(stripe),
  });
});

const ALLOWED_EVENTS = new Set([
  'page_view',
  'click_buy',
  'click_whatsapp',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'video_play',
  'faq_open',
  'checkout_canceled',
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
    if (err) return res.status(500).json({ ok: false });
    res.json({ ok: true });
  });
});

app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      ok: false,
      error: 'stripe_not_configured',
      message: 'Set STRIPE_SECRET_KEY in .env to enable checkout. Use WhatsApp fallback meanwhile.',
    });
  }
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Electric Spin Cleaning Brush',
              description: 'Cordless rotating scrubber — 4 brush heads included.',
            },
            unit_amount: 2999,
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'PK', 'AE', 'SA'] },
      success_url: `${PUBLIC_URL}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/?canceled=1`,
    });

    fs.appendFile(
      EVENTS_FILE,
      JSON.stringify({ ts: new Date().toISOString(), event: 'begin_checkout', props: { sessionId: session.id } }) + '\n',
      () => {}
    );

    res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('checkout error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function readEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  return fs
    .readFileSync(EVENTS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

app.get('/api/metrics.json', (_req, res) => {
  const events = readEvents();
  const counts = events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});
  const pageViews = counts.page_view || 0;
  const buyClicks = counts.click_buy || 0;
  const waClicks = counts.click_whatsapp || 0;
  const purchases = counts.purchase || 0;
  res.json({
    totals: counts,
    pageViews,
    buyClicks,
    whatsappClicks: waClicks,
    whatsappCTR: pageViews ? +(waClicks / pageViews * 100).toFixed(2) : 0,
    buyCTR: pageViews ? +(buyClicks / pageViews * 100).toFixed(2) : 0,
    conversionRate: pageViews ? +(purchases / pageViews * 100).toFixed(2) : 0,
    sales: purchases,
    eventsLogged: events.length,
  });
});

// Prometheus exposition format — scrape this with Prometheus, then visualize in Grafana.
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
  const pv = counts.page_view || 0;
  const purchases = counts.purchase || 0;
  lines.push('# HELP store_conversion_rate Purchases divided by page views (0-1)');
  lines.push('# TYPE store_conversion_rate gauge');
  lines.push(`store_conversion_rate ${pv ? (purchases / pv).toFixed(4) : 0}`);
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n') + '\n');
});

app.get('/admin/metrics', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Locally: start the listener. On Vercel: export the handler instead.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Store running on ${PUBLIC_URL}`);
    console.log(`Stripe: ${stripe ? 'enabled' : 'DISABLED (set STRIPE_SECRET_KEY)'}`);
    console.log(`Metrics:  ${PUBLIC_URL}/metrics  (Prometheus)`);
    console.log(`Dashboard: ${PUBLIC_URL}/admin/metrics`);
  });
}

module.exports = app;
