# Electric Spin Cleaning Brush — Lean Dropshipping Store

Mobile-first single-product landing page tuned for TikTok traffic. Stripe checkout, WhatsApp fallback, JSON event log, Prometheus `/metrics` for Grafana.

## Quick start

```bash
npm install
cp .env.example .env       # then edit STRIPE_SECRET_KEY, etc.
npm start
```

Visit:

- **Store:** http://localhost:3000
- **Live admin metrics:** http://localhost:3000/admin/metrics
- **Prometheus scrape endpoint:** http://localhost:3000/metrics
- **Raw JSON metrics:** http://localhost:3000/api/metrics.json

## Environment

| var | purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (starts with `sk_test_` or `sk_live_`). If unset, Buy buttons fall back to WhatsApp automatically. |
| `STRIPE_PRICE_ID` | Optional. If set, used for the line item; otherwise an inline $29.99 price is created. |
| `WHATSAPP_NUMBER` | International format with no `+`. The provided number `03341271461` is Pakistan, so use `923341271461`. |
| `PUBLIC_URL` | Used for Stripe success/cancel redirects. Set to your real domain in production. |
| `PORT` | Defaults to 3000. |

## File map

```
server.js                 Express server: /api/track, /api/checkout, /metrics, /api/metrics.json
public/index.html         Landing page
public/styles.css         Mobile-first styles
public/app.js             Frontend analytics + Stripe call + sticky CTA
public/admin.html         Live metrics dashboard (no auth — protect in prod)
public/media/             Drop your UGC videos here as demo1.mp4, ugc1.mp4 ... ugc6.mp4
data/events.jsonl         Append-only event log (created on first event)
grafana/dashboard.json    Import into Grafana for Traffic/CTR/CVR/Sales panels
grafana/prometheus.yml    Sample Prometheus scrape config
```

## TikTok content patterns the page is built for

The hero, UGC wall, and hooks were modeled on patterns from these reference videos (not copied):

- @kate_cleanhome — before/after grout demo
- @stephaniarahme — POV cleaning satisfaction
- @quick.cleannn — fast-cut demo with caption hooks

Hook templates already wired into the UGC grid:

- "This made cleaning 10x easier"
- "Why didn't I buy this sooner?"
- "Watch it remove stains instantly"
- "POV: you finally clean the grout"
- "Tell me this isn't satisfying"
- "My bathroom in 90 seconds"

Drop vertical 9:16 mp4 clips into `public/media/` named `demo1.mp4`, `ugc1.mp4` … `ugc6.mp4`. The hero phone uses `demo1.mp4`.

## Stripe checkout

`POST /api/checkout` creates a Stripe Checkout Session and returns `{ url }`. The frontend redirects to it. On success, Stripe sends users back to `/?paid=1&session_id=...`, which fires a `purchase` analytics event.

For real money:
1. Set `STRIPE_SECRET_KEY` to your live key.
2. Either create a Product/Price in Stripe and put the price ID in `STRIPE_PRICE_ID`, or leave it blank to use the inline $29.99.
3. Set `PUBLIC_URL` to your deployed domain.

## WhatsApp fallback

Every Buy button gracefully falls back to WhatsApp if Stripe isn't configured. The "Order on WhatsApp" buttons are wired with the prefilled message `I want to order Electric Spin Cleaning Brush` to `wa.me/<WHATSAPP_NUMBER>`.

## Analytics

Events are appended to `data/events.jsonl` (one JSON object per line). Allowed events:

`page_view, click_buy, click_whatsapp, add_to_cart, begin_checkout, purchase, video_play, faq_open, checkout_canceled`

## Grafana wiring

1. Run Prometheus pointing at `prometheus.yml` (or copy its `scrape_configs` block into yours).
2. In Grafana, add the Prometheus datasource (uid `prometheus`).
3. Import `grafana/dashboard.json`. You get panels for:
   - Page views (24h)
   - Sales (24h)
   - Conversion rate
   - Buy-button CTR
   - Traffic over time
   - Buy vs WhatsApp click rate
   - Funnel (all events)

If you don't want Prometheus, the `/admin/metrics` page reads `/api/metrics.json` directly and shows the same numbers live.

## Performance notes

- Single HTML file, no framework, ~6 KB CSS.
- Videos use `preload="none"` and only play when in viewport (IntersectionObserver).
- `sendBeacon` for analytics so tracking never blocks navigation.
- Sticky CTA only renders on mobile (`<760px`).

## Iteration tips

- Edit headline/price in `public/index.html` (search for `Stop Scrubbing`, `$29.99`).
- Swap UGC clips by replacing files in `public/media/`.
- Add new tracked events: extend `ALLOWED_EVENTS` in `server.js` and call `track('your_event')` in `app.js`.
