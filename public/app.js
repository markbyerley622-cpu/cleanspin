(() => {
  const state = { config: null };

  // -------- analytics --------
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

  // -------- video segment looper --------
  // Each <video data-src=... data-start=N data-end=M> plays only that slice on a loop.
  // If the source is shorter than data-end, we clamp to duration.
  function setupVideoSegment(video) {
    const src = video.dataset.src;
    const start = parseFloat(video.dataset.start || '0');
    let end = parseFloat(video.dataset.end || '0');
    if (!src) return;
    // attach a <source>
    const source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    video.appendChild(source);
    video.muted = true;
    video.playsInline = true;
    video.loop = false; // we manage looping manually for the slice

    const onMeta = () => {
      if (!end || end <= start || end > video.duration) {
        end = Math.min(start + 5, video.duration || start + 5);
      }
      try { video.currentTime = start; } catch (e) {}
    };
    video.addEventListener('loadedmetadata', onMeta);

    video.addEventListener('timeupdate', () => {
      if (end && video.currentTime >= end) {
        try { video.currentTime = start; video.play().catch(()=>{}); } catch (e) {}
      }
    });

    // Restart on ended just in case
    video.addEventListener('ended', () => {
      try { video.currentTime = start; video.play().catch(()=>{}); } catch (e) {}
    });
  }

  function initVideos() {
    document.querySelectorAll('video[data-src]').forEach(setupVideoSegment);

    // hero video plays immediately (autoplay attr already set on .ugc-video)
    const hero = document.querySelector('.ugc-video');
    if (hero) hero.play().catch(()=>{});

    // grid videos: play only when in viewport
    const cards = document.querySelectorAll('.ugc-card video');
    if (!cards.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          v.play().catch(()=>{});
          track('video_play', { src: v.dataset.src || '' });
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.4 });
    cards.forEach((v) => io.observe(v));
  }

  // -------- scroll reveal --------
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

  // -------- config + WhatsApp wiring --------
  async function loadConfig() {
    try {
      const r = await fetch('/api/config');
      state.config = await r.json();
    } catch {
      state.config = {
        whatsappNumber: '923341271461',
        whatsappMessage: 'I want to order Electric Spin Cleaning Brush',
        stripeEnabled: false,
      };
    }
    const waUrl = `https://wa.me/${state.config.whatsappNumber}?text=${encodeURIComponent(state.config.whatsappMessage)}`;
    document.querySelectorAll('#waBtn,#waBtn2').forEach((a) => {
      a.href = waUrl;
      a.target = '_blank';
      a.addEventListener('click', () => track('click_whatsapp', { placement: a.id }));
    });
  }

  // -------- buy buttons --------
  async function startCheckout(placement) {
    track('click_buy', { placement });
    track('add_to_cart', { sku: 'spin-brush-01', price: 29.99 });
    try {
      const r = await fetch('/api/checkout', { method: 'POST' });
      const data = await r.json();
      if (data.ok && data.url) {
        track('begin_checkout');
        window.location.href = data.url;
      } else {
        const fallback = state.config && `https://wa.me/${state.config.whatsappNumber}?text=${encodeURIComponent(state.config.whatsappMessage)}`;
        if (fallback) {
          alert("Card checkout isn't ready yet — sending you to WhatsApp to complete your order.");
          window.location.href = fallback;
        } else {
          alert('Checkout unavailable. Please try WhatsApp.');
        }
      }
    } catch (e) {
      alert('Network error — please try WhatsApp.');
    }
  }

  function wireBuy() {
    ['buyBtn', 'buyBtn2', 'buyBtnSticky'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => startCheckout(id));
    });
  }

  // -------- sticky CTA --------
  function wireSticky() {
    const sticky = document.getElementById('sticky');
    const hero = document.querySelector('.hero');
    if (!sticky || !hero) return;
    const obs = new IntersectionObserver(([entry]) => {
      sticky.classList.toggle('show', !entry.isIntersecting);
    }, { threshold: 0 });
    obs.observe(hero);
  }

  // -------- FAQ tracking --------
  function wireFAQ() {
    document.querySelectorAll('.faq details').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) track('faq_open', { q: d.querySelector('summary')?.textContent || '' });
      });
    });
  }

  // -------- Stripe redirect handling --------
  function handleReturn() {
    const p = new URLSearchParams(location.search);
    if (p.get('paid') === '1') {
      track('purchase', { sessionId: p.get('session_id') || '' });
      alert("Thanks! Your order is in. We'll email tracking shortly.");
    } else if (p.get('canceled') === '1') {
      track('checkout_canceled');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    track('page_view', { path: location.pathname, ref: document.referrer || '' });
    initReveal();
    initVideos();
    loadConfig().then(wireBuy);
    wireSticky();
    wireFAQ();
    handleReturn();
  });
})();
