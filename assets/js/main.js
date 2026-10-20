/* Gabriele Decandia — Portfolio. Small, dependency-free enhancements.
   Everything here is progressive: the site reads fine without it. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  /* ---------- Theme ---------- */
  const toggle = document.querySelector('[data-theme-toggle]');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  const syncToggle = () => {
    if (!toggle) return;
    const dark = currentTheme() === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
  };
  toggle?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    store.set('theme', next);
    syncToggle();
  });
  systemDark.addEventListener?.('change', syncToggle);
  syncToggle();

  /* ---------- Local time in Altamura ---------- */
  const clock = document.querySelector('[data-clock] time');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick();
    setInterval(tick, 15000);
  }

  /* ---------- Header: hide on scroll down, show on scroll up ---------- */
  const header = document.querySelector('.site-header');
  if (header) {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 8);
      const goingDown = y > lastY && y > 240;
      header.classList.toggle('is-hidden', goingDown && !header.contains(document.activeElement));
      lastY = y;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
    onScroll();
  }

  /* ---------- Reveal on scroll ---------- */
  const revealables = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-loaded')));

  /* ---------- Copy e-mail ---------- */
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('span');
    const original = label?.textContent;
    btn.addEventListener('click', async () => {
      const value = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value });
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.append(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* nothing else to try */ }
        ta.remove();
      }
      btn.dataset.copied = 'true';
      if (label) label.textContent = 'Copied';
      setTimeout(() => {
        btn.dataset.copied = 'false';
        if (label) label.textContent = original;
      }, 1800);
    });
  });

  /* ---------- Before / after ---------- */
  document.querySelectorAll('[data-ba]').forEach((ba) => {
    const input = ba.querySelector('input[type="range"]');
    const set = () => ba.style.setProperty('--pos', `${input.value}%`);
    input.addEventListener('input', set);
    set();
  });

  /* ---------- Footer year ---------- */
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Sentinel: the thesis model, running in the browser ---------- */
  const demo = document.querySelector('[data-sentinel]');
  if (demo) initSentinel(demo);

  async function initSentinel(el) {
    const textarea = el.querySelector('textarea');
    const out = {
      cat: el.querySelector('[data-out="cat"]'),
      catBars: el.querySelector('[data-bars="cat"]'),
      sent: el.querySelector('[data-out="sent"]'),
      sentBars: el.querySelector('[data-bars="sent"]'),
      tokens: el.querySelector('[data-out="tokens"]'),
      warn: el.querySelector('[data-out="warn"]'),
    };
    const LABELS = {
      'Accoglienza': 'Front desk',
      'Cibo/Ristorazione': 'Food & dining',
      'Posizione': 'Location',
      'Servizi/Wifi': 'Services & Wi‑Fi',
      'Positivo': 'Positive',
      'Negativo': 'Negative',
    };

    let model;
    try {
      const res = await fetch(el.dataset.model);
      model = await res.json();
    } catch {
      out.warn.textContent = 'The model could not be loaded — try reloading the page.';
      return;
    }

    // Same tokenizer as scikit-learn's CountVectorizer defaults:
    // lowercase, tokens of 2+ word characters.
    const tokenize = (s) => s.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];

    const vectorize = (tokens, vocab) => {
      const counts = new Map();
      for (const t of tokens) {
        const i = vocab[t];
        if (i !== undefined) counts.set(i, (counts.get(i) || 0) + 1);
      }
      return counts;
    };

    const dot = (counts, w) => { let s = 0; for (const [i, c] of counts) s += w[i] * c; return s; };

    const predict = (m, tokens) => {
      const x = vectorize(tokens, m.vocab);
      if (m.classes.length === 2) {
        const z = dot(x, m.coef[0]) + m.intercept[0];
        const p1 = 1 / (1 + Math.exp(-z));
        return m.classes.map((c, k) => ({ c, p: k === 1 ? p1 : 1 - p1 }));
      }
      const z = m.coef.map((w, k) => dot(x, w) + m.intercept[k]);
      const max = Math.max(...z);
      const e = z.map((v) => Math.exp(v - max));
      const sum = e.reduce((a, b) => a + b, 0);
      return m.classes.map((c, k) => ({ c, p: e[k] / sum }));
    };

    const renderBars = (container, probs) => {
      const top = Math.max(...probs.map((r) => r.p));
      container.replaceChildren(...probs
        .slice()
        .sort((a, b) => b.p - a.p)
        .map((r) => {
          const row = document.createElement('div');
          row.className = 'bar' + (r.p === top ? ' is-top' : '');
          const name = document.createElement('span');
          name.textContent = LABELS[r.c] || r.c;
          const track = document.createElement('span');
          track.className = 'bar-track';
          const fill = document.createElement('span');
          fill.className = 'bar-fill';
          fill.style.setProperty('--p', (r.p * 100).toFixed(1));
          track.append(fill);
          const num = document.createElement('span');
          num.className = 'bar-num';
          num.textContent = `${(r.p * 100).toFixed(1)}%`;
          row.append(name, track, num);
          return row;
        }));
    };

    const renderTokens = (raw) => {
      const words = raw.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
      out.tokens.replaceChildren(...words.map((w) => {
        const span = document.createElement('span');
        span.textContent = w;
        if (model.category.vocab[w] !== undefined) span.className = 'known';
        return span;
      }));
      return words.filter((w) => model.category.vocab[w] !== undefined).length;
    };

    const run = () => {
      const text = textarea.value.trim();
      const tokens = tokenize(text);
      const known = renderTokens(text);
      const cat = predict(model.category, tokens);
      const sent = predict(model.sentiment, tokens);
      const bestCat = cat.reduce((a, b) => (b.p > a.p ? b : a));
      const bestSent = sent.reduce((a, b) => (b.p > a.p ? b : a));
      out.cat.innerHTML = '';
      out.cat.append(document.createTextNode(LABELS[bestCat.c]));
      const small1 = document.createElement('small');
      small1.textContent = `Model label: ${bestCat.c}`;
      out.cat.append(small1);
      out.sent.innerHTML = '';
      out.sent.append(document.createTextNode(LABELS[bestSent.c]));
      const small2 = document.createElement('small');
      small2.textContent = `Model label: ${bestSent.c}`;
      out.sent.append(small2);
      renderBars(out.catBars, cat);
      renderBars(out.sentBars, sent);

      if (!text) out.warn.textContent = 'Type a sentence to see what the model thinks.';
      else if (known === 0) out.warn.textContent = 'None of these words are in the 86-word vocabulary — the model is guessing from its priors.';
      else if (bestSent.p < 0.6) out.warn.textContent = 'Sentiment confidence is close to a coin flip: this sentence is outside what the training data covered.';
      else out.warn.textContent = '';
    };

    let t;
    textarea.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 90); });
    el.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => {
      textarea.value = b.dataset.example;
      run();
      textarea.focus({ preventScroll: true });
    }));
    run();
  }
})();
