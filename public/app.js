(() => {
  // ---------- analytics ----------
  function track(event, props = {}) {
    try {
      const body = JSON.stringify({ event, props });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body, keepalive: true,
        });
      }
    } catch (e) { /* silent */ }
  }

  // TikTok Pixel — fires standard events for ad optimization.
  // ttq is loaded via the base pixel snippet in index.html <head>.
  function tt(event, props = {}) {
    try { if (window.ttq && typeof window.ttq.track === 'function') window.ttq.track(event, props); } catch (e) { /* silent */ }
  }

  // ---------- runtime config (from /api/config) ----------
  const config = { shopifyDomain: '', variants: {}, discount: '' };
  let configPromise = null;
  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch('/api/config')
      .then((r) => r.json())
      .then((data) => { Object.assign(config, data); })
      .catch(() => { /* silent */ });
    return configPromise;
  }

  // ---------- bundles ----------
  const BUNDLES = {
    single: { tier: 'single', label: 'Single',  qty: 1, price: 29.99, old: 59.99 },
    double: { tier: 'double', label: '2-Pack',  qty: 2, price: 49.99, old: 59.98 },
    triple: { tier: 'triple', label: '3-Pack',  qty: 3, price: 69.99, old: 89.97 },
  };
  let selectedBundle = 'double';

  function fmt(n) { return `$${n.toFixed(2)}`; }

  function renderPrice() {
    const b = BUNDLES[selectedBundle];
    document.querySelectorAll('[data-price-new]').forEach((el) => { el.textContent = fmt(b.price); });
    document.querySelectorAll('[data-price-old]').forEach((el) => { el.textContent = fmt(b.old); });
    document.querySelectorAll('[data-cta-text]').forEach((el) => { el.textContent = `Get the ${b.label} — ${fmt(b.price)}`; });
  }

  function selectBundle(tier, fromUser = true) {
    if (!BUNDLES[tier]) return;
    selectedBundle = tier;
    document.querySelectorAll('.bundle-option').forEach((el) => {
      const on = el.dataset.tier === tier;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    renderPrice();
    if (fromUser) track('select_bundle', { tier });
  }

  function wireBundleSelector() {
    document.querySelectorAll('.bundle-option').forEach((el) => {
      el.addEventListener('click', () => selectBundle(el.dataset.tier));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBundle(el.dataset.tier); }
      });
    });
    selectBundle(selectedBundle, false);
  }

  // ---------- Shopify cart permalink ----------
  function buildCartUrl(tier) {
    const b = BUNDLES[tier];
    if (!config.shopifyDomain) return null;
    // Prefer a dedicated variant per bundle if set; otherwise multiply quantity on the single variant.
    const dedicated = config.variants[tier];
    const fallback  = config.variants.single;
    const variantId = dedicated || fallback;
    if (!variantId) return null;
    const qty = dedicated ? 1 : b.qty;
    const params = new URLSearchParams();
    if (config.discount) params.set('discount', config.discount);
    const qs = params.toString();
    return `https://${config.shopifyDomain}/cart/${variantId}:${qty}${qs ? `?${qs}` : ''}`;
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = '<span class="btn-glow"></span>Opening checkout…';
      btn.disabled = true;
      btn.style.opacity = '0.85';
      btn.style.cursor = 'wait';
    } else {
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  }

  async function startCheckout(btn, placement) {
    const b = BUNDLES[selectedBundle];
    track('click_buy', { placement, tier: selectedBundle });
    track('add_to_cart', { tier: selectedBundle, price: b.price, qty: b.qty });
    setLoading(btn, true);
    await loadConfig();
    const url = buildCartUrl(selectedBundle);
    if (!url) {
      setLoading(btn, false);
      alert('Checkout is being configured. Please refresh in a moment.');
      return;
    }
    track('begin_checkout', { tier: selectedBundle });

    // Fire TikTok Pixel standard events (AddToCart + InitiateCheckout)
    // before navigating, so they reach TikTok before the page unloads.
    const variantId = (config.variants && (config.variants[selectedBundle] || config.variants.single)) || '';
    const ttPayload = {
      content_id: variantId || `cleanspin-${selectedBundle}`,
      content_type: 'product',
      content_name: `CleanSpin ${b.label}`,
      quantity: b.qty,
      value: b.price,
      currency: 'USD',
    };
    tt('AddToCart', ttPayload);
    tt('InitiateCheckout', ttPayload);

    window.location.href = url;
  }

  function wireBuy() {
    ['buyBtn', 'buyBtn2', 'buyBtnSticky'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => startCheckout(el, id));
    });
  }

  // ---------- video segment looper ----------
  function setupVideoSegment(video) {
    const src = video.dataset.src;
    const start = parseFloat(video.dataset.start || '0');
    let end = parseFloat(video.dataset.end || '0');
    if (!src) return;
    const source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    video.appendChild(source);
    video.muted = true;
    video.playsInline = true;
    video.loop = false;

    const onMeta = () => {
      if (!end || end <= start || end > video.duration) {
        end = Math.min(start + 5, video.duration || start + 5);
      }
      try { video.currentTime = start; } catch (e) {}
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('timeupdate', () => {
      if (end && video.currentTime >= end) {
        try { video.currentTime = start; video.play().catch(() => {}); } catch (e) {}
      }
    });
    video.addEventListener('ended', () => {
      try { video.currentTime = start; video.play().catch(() => {}); } catch (e) {}
    });
  }

  function initVideos() {
    document.querySelectorAll('video[data-src]').forEach(setupVideoSegment);
    const hero = document.querySelector('.ugc-video');
    if (hero) hero.play().catch(() => {});
    const cards = document.querySelectorAll('.ugc-card video');
    if (!cards.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          v.play().catch(() => {});
          track('video_play', { src: v.dataset.src || '' });
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.4 });
    cards.forEach((v) => io.observe(v));
  }

  // ---------- scroll reveal ----------
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
  }

  // ---------- sticky CTA ----------
  function wireSticky() {
    const sticky = document.getElementById('sticky');
    const hero = document.querySelector('.hero');
    if (!sticky || !hero) return;
    const obs = new IntersectionObserver(([entry]) => {
      sticky.classList.toggle('show', !entry.isIntersecting);
    }, { threshold: 0 });
    obs.observe(hero);
  }

  // ---------- FAQ tracking ----------
  function wireFAQ() {
    document.querySelectorAll('.faq details').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) track('faq_open', { q: d.querySelector('summary')?.textContent || '' });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    track('page_view', { path: location.pathname, ref: document.referrer || '' });
    initReveal();
    initVideos();
    wireBundleSelector();
    wireBuy();
    wireSticky();
    wireFAQ();
    loadConfig(); // preload so the first buy click is instant
  });
})();
