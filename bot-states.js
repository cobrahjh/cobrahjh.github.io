// Live bot-state badges + collapsible card layout for the internal docs.
// - Reads /internal/bot-states.json (written by stream-control on a 60s timer)
// - Decorates [data-bot] elements with LIVE / OFFLINE pills (broadcast icon for LIVE)
// - On guide pages: wraps each <h2> + content into a card with chevron, title, badge, "N cmds" count
// - Adds a search bar and section filter pills
// - Adds a red OFFLINE banner with ⚠ icon (only shown when something is offline/disabled)
// - Hover tooltips on existing .badge-all / .badge-mod / .badge-auto
(function() {
  const STYLE = `
    /* Per-section state pill */
    .bot-state {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 0.65rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 3px 8px;
      border-radius: 6px;
      vertical-align: middle; cursor: help;
      margin-left: 6px;
    }
    .bot-state--online   { background: hsl(142 71% 45% / 0.15); color: hsl(142 71% 55%); }
    .bot-state--disabled,
    .bot-state--offline  { background: hsl(0 90% 55% / 0.15); color: hsl(0 95% 65%); }
    .bot-state-icon { width: 12px; height: 12px; flex-shrink: 0; }
    .badge[title], .card-tag[title] { cursor: help; }

    /* Search bar */
    .doc-search-wrap { position: relative; margin: 1.25rem 0 0.75rem; }
    .doc-search-input {
      width: 100%; box-sizing: border-box;
      padding: 0.85rem 1rem 0.85rem 2.85rem;
      background: var(--card, hsl(0 0% 9%));
      border: 1px solid var(--border, hsl(0 0% 18%));
      border-radius: 12px;
      color: inherit; font: inherit; font-size: 0.95rem;
    }
    .doc-search-input:focus { outline: none; border-color: var(--primary, hsl(37 91% 55%)); }
    .doc-search-icon {
      position: absolute; left: 1rem; top: 50%; transform: translateY(-50%);
      width: 18px; height: 18px; color: var(--muted, #888); pointer-events: none;
    }

    /* Filter pills */
    .doc-filters { display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0 0 1.25rem; }
    .doc-filter-pill {
      padding: 6px 16px; border-radius: 999px;
      background: var(--card, hsl(0 0% 9%));
      border: 1px solid var(--border, hsl(0 0% 18%));
      color: inherit; font: inherit; font-size: 0.85rem; font-weight: 500;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, color 0.15s;
    }
    .doc-filter-pill:hover { border-color: var(--primary, hsl(37 91% 55%)); }
    .doc-filter-pill.active {
      background: var(--primary, hsl(37 91% 55%));
      color: var(--primary-fg, hsl(0 0% 5%));
      border-color: var(--primary, hsl(37 91% 55%));
      font-weight: 600;
    }

    /* OFFLINE banner */
    .hive-status-banner {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 0.75rem 1.1rem;
      margin: 0 0 1rem;
      background: hsl(0 90% 55% / 0.05);
      border: 1px solid hsl(0 90% 55% / 0.30);
      border-radius: 10px;
    }
    .hive-status-banner-icon { display: inline-flex; color: hsl(0 90% 60%); flex-shrink: 0; }
    .hive-status-banner-label {
      font-size: 0.7rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.15em;
      color: var(--muted, #888); margin-right: 4px;
    }
    .status-chip {
      display: inline-block; padding: 4px 11px; border-radius: 6px;
      font-size: 0.78rem; font-weight: 500; text-decoration: none; cursor: pointer;
      background: hsl(0 90% 55% / 0.10);
      color: hsl(0 95% 65%);
      transition: filter 0.15s;
    }
    .status-chip:hover { filter: brightness(1.25); }

    /* Section cards (guide pages only) */
    .section-card {
      background: var(--card, hsl(0 0% 9%));
      border: 1px solid var(--border, hsl(0 0% 18%));
      border-radius: 10px;
      margin: 0.55rem 0;
      overflow: hidden;
    }
    .section-card.hidden { display: none; }
    .section-card-header {
      display: flex; align-items: center; gap: 12px;
      padding: 0.95rem 1.15rem;
      cursor: pointer; user-select: none;
    }
    .section-card-header h2 {
      margin: 0; flex: 1;
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
      font-size: 1.05rem; font-weight: 700;
      cursor: pointer;
      border: none !important; padding: 0 !important;
    }
    .section-card-body {
      padding: 0.25rem 1.25rem 1.25rem;
      border-top: 1px solid var(--border, hsl(0 0% 18%));
    }
    .section-card-body.hidden { display: none; }
    .section-card-count {
      font-size: 0.78rem; color: var(--muted, #888); flex-shrink: 0;
    }
    .section-chevron {
      display: inline-block; flex-shrink: 0;
      width: 16px; text-align: center;
      font-size: 1.05rem; line-height: 1;
      color: var(--muted, #888);
      transition: transform 0.18s, color 0.15s;
    }
    .section-chevron.expanded { transform: rotate(90deg); }
    .section-card-header:hover .section-chevron { color: var(--primary, hsl(37 91% 55%)); }

    /* Search-driven row hiding */
    .row-hidden { display: none !important; }

    /* Hide native scrollbar gutter for collapsed sections */
    .section-card-body[hidden] { display: none; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // STATE labels — disabled & offline both render as "OFFLINE" (red). LIVE keeps broadcast icon.
  const STATE = {
    online:   { text: 'LIVE',    tip: 'Service running and accepting commands' },
    disabled: { text: 'OFFLINE', tip: 'Toggled off in the Twitch Stream Administrator Hub — chat commands are not handled' },
    offline:  { text: 'OFFLINE', tip: 'Service is not running' },
  };

  const SVG = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
    alert:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    cast:   '<svg class="bot-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M20.07 4.93a10 10 0 0 1 0 14.14"/><path d="M3.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
  };

  // ── Hover tips on existing access badges ──
  const ACCESS_TIPS = {
    'badge-all':  'Available to everyone in chat — no special role required',
    'badge-mod':  'Mod or broadcaster only — viewers cannot run these commands',
    'badge-auto': 'Runs automatically — no command needed',
  };
  document.querySelectorAll('.badge').forEach(el => {
    if (el.title) return;
    for (const cls of Object.keys(ACCESS_TIPS)) {
      if (el.classList.contains(cls)) { el.title = ACCESS_TIPS[cls]; return; }
    }
  });

  // Page detection
  const isGuidePage = !!document.querySelector('h2[id]');

  // ── Collapse state ──
  const COLLAPSE_KEY = 'hive_doc_collapse_' + location.pathname;
  let userState = {};
  try { userState = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { userState = {}; }
  function saveUserState() { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(userState)); }

  // === GUIDE-PAGE: wrap each <h2> section into a card ===
  const cards = []; // { card, headerWrap, body, sectionId, title, countEl }

  function cleanTitle(h2) {
    const clone = h2.cloneNode(true);
    clone.querySelectorAll('.bot-state, .badge, .section-chevron').forEach(n => n.remove());
    return clone.textContent.trim();
  }

  function buildCards() {
    const headers = Array.from(document.querySelectorAll('h2[id]'));
    headers.forEach(h2 => {
      // Collect siblings until next h2[id] or end of parent
      const content = [];
      let n = h2.nextElementSibling;
      while (n && !(n.tagName === 'H2' && n.id)) {
        content.push(n);
        n = n.nextElementSibling;
      }

      const card = document.createElement('div');
      card.className = 'section-card';
      card.dataset.sectionId = h2.id;

      const headerWrap = document.createElement('div');
      headerWrap.className = 'section-card-header';

      const chev = document.createElement('span');
      chev.className = 'section-chevron';
      chev.textContent = '›'; // ›
      headerWrap.appendChild(chev);

      // Insert card before h2, then move h2 into card-header, content into card-body
      h2.parentNode.insertBefore(card, h2);
      headerWrap.appendChild(h2);
      card.appendChild(headerWrap);

      // Count: prefer rows in tables (excluding header-only rows), fall back to li count
      const body = document.createElement('div');
      body.className = 'section-card-body';
      content.forEach(c => body.appendChild(c));

      const tableRows = Array.from(body.querySelectorAll('table tr')).filter(tr => tr.querySelector('td'));
      const liCount = body.querySelectorAll('li').length;
      const cmdCount = tableRows.length || liCount;

      const countEl = document.createElement('span');
      countEl.className = 'section-card-count';
      countEl.textContent = cmdCount + ' cmd' + (cmdCount === 1 ? '' : 's');
      headerWrap.appendChild(countEl);

      card.appendChild(body);

      // Default: collapsed (matches screenshot). User overrides persist.
      const initiallyCollapsed = h2.id in userState ? !!userState[h2.id] : true;
      applyCardCollapse(card, initiallyCollapsed);

      headerWrap.addEventListener('click', e => {
        if (e.target.closest('a, button, input, select')) return;
        const next = !card.__collapsed;
        userState[h2.id] = next;
        saveUserState();
        applyCardCollapse(card, next);
      });

      cards.push({ card, headerWrap, body, sectionId: h2.id, title: cleanTitle(h2), countEl });
    });
  }

  function applyCardCollapse(card, collapsed) {
    const body = card.querySelector('.section-card-body');
    const chev = card.querySelector('.section-chevron');
    if (body) body.classList.toggle('hidden', collapsed);
    if (chev) chev.classList.toggle('expanded', !collapsed);
    card.__collapsed = collapsed;
  }

  function buildSearchBar() {
    if (cards.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'doc-search-wrap';
    wrap.innerHTML = '<span class="doc-search-icon">' + SVG.search + '</span>' +
      '<input type="text" class="doc-search-input" placeholder="Search commands..." aria-label="Search commands">';
    const firstCard = document.querySelector('.section-card');
    firstCard.parentNode.insertBefore(wrap, firstCard);

    wrap.querySelector('input').addEventListener('input', e => doSearch(e.target.value.trim().toLowerCase()));
  }

  function buildFilterPills() {
    if (cards.length === 0) return;
    const row = document.createElement('div');
    row.className = 'doc-filters';

    const allBtn = document.createElement('button');
    allBtn.className = 'doc-filter-pill active';
    allBtn.textContent = 'All';
    allBtn.dataset.filter = 'all';
    row.appendChild(allBtn);

    cards.forEach(({ sectionId, title }) => {
      const p = document.createElement('button');
      p.className = 'doc-filter-pill';
      p.textContent = title;
      p.dataset.filter = sectionId;
      row.appendChild(p);
    });

    const searchWrap = document.querySelector('.doc-search-wrap');
    searchWrap.parentNode.insertBefore(row, searchWrap.nextSibling);

    row.addEventListener('click', e => {
      const btn = e.target.closest('.doc-filter-pill');
      if (!btn) return;
      row.querySelectorAll('.doc-filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      doFilter(btn.dataset.filter);
    });
  }

  function doFilter(key) {
    cards.forEach(({ card, sectionId }) => {
      card.classList.toggle('hidden', key !== 'all' && sectionId !== key);
    });
  }

  function doSearch(q) {
    if (!q) {
      cards.forEach(({ card, body }) => {
        body.querySelectorAll('.row-hidden').forEach(el => el.classList.remove('row-hidden'));
        card.classList.remove('hidden');
      });
      return;
    }
    cards.forEach(({ card, body, headerWrap }) => {
      let any = false;
      const titleMatch = headerWrap.textContent.toLowerCase().includes(q);
      const trs = body.querySelectorAll('table tr');
      trs.forEach(tr => {
        if (tr.querySelector('th') && !tr.querySelector('td')) return;
        const m = tr.textContent.toLowerCase().includes(q);
        tr.classList.toggle('row-hidden', !m);
        if (m) any = true;
      });
      const lis = body.querySelectorAll('li');
      lis.forEach(li => {
        const m = li.textContent.toLowerCase().includes(q);
        li.classList.toggle('row-hidden', !m);
        if (m) any = true;
      });
      const hasContent = trs.length > 0 || lis.length > 0;
      card.classList.toggle('hidden', hasContent && !any && !titleMatch);
      // Auto-expand cards with hits while searching
      if ((any || titleMatch) && card.__collapsed) applyCardCollapse(card, false);
    });
  }

  // ── Bot state aggregation ──
  function aggregate(keys, bots) {
    let worstState = 'online';
    let worstBot = null;
    for (const k of keys) {
      const b = bots[k];
      if (!b) continue;
      if (b.state === 'offline') return { state: 'offline', bot: b };
      if (b.state === 'disabled') { worstState = 'disabled'; worstBot = b; }
    }
    return { state: worstState, bot: worstBot || bots[keys[0]] || null };
  }

  function getElTitle(el) {
    if (el.__sectionTitle) return el.__sectionTitle;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.bot-state, .badge, .section-chevron').forEach(n => n.remove());
    const t = clone.textContent.trim();
    el.__sectionTitle = t;
    return t;
  }

  // ── OFFLINE banner ──
  function renderStatusBanner(bots) {
    const sections = [];
    document.querySelectorAll('[data-bot]').forEach(el => {
      if (!el.id) return;
      const inCard = el.closest('.section-card');
      const isCardHeader = !!inCard && inCard.querySelector(':scope > .section-card-header h2') === el;
      const isOriginalH2 = el.matches('h2[id]') && !inCard;
      const isSectionTitle = el.matches('.section-title[id]');
      if (!isCardHeader && !isOriginalH2 && !isSectionTitle) return;
      const keys = el.getAttribute('data-bot').split(',').map(s => s.trim()).filter(Boolean);
      const { state, bot } = aggregate(keys, bots);
      if (!bot) return;
      sections.push({
        title: getElTitle(el),
        targetId: el.id,
        state,
        tip: bot.label + ': ' + STATE[state].tip,
      });
    });

    const offline = sections
      .filter(s => s.state !== 'online')
      .sort((a, b) => a.title.localeCompare(b.title));

    let banner = document.getElementById('hive-status-banner');
    if (offline.length === 0) {
      if (banner) banner.style.display = 'none';
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'hive-status-banner';
      banner.className = 'hive-status-banner';
      // Insert above filters/search if present, otherwise above first card / first header
      const target = document.querySelector('.doc-search-wrap')
                  || document.querySelector('.section-card')
                  || document.querySelector('h2[id], .section-title[id]');
      if (target && target.parentNode) target.parentNode.insertBefore(banner, target);
      else document.body.appendChild(banner);
    }
    banner.style.display = '';
    banner.innerHTML = '';

    const icon = document.createElement('span');
    icon.className = 'hive-status-banner-icon';
    icon.innerHTML = SVG.alert;
    banner.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'hive-status-banner-label';
    label.textContent = 'Offline';
    banner.appendChild(label);

    offline.forEach(({ title, targetId, tip }) => {
      const a = document.createElement('a');
      a.className = 'status-chip';
      a.textContent = title;
      a.href = '#' + targetId;
      a.title = tip + ' (click to jump)';
      banner.appendChild(a);
    });
  }

  function decorate(bots) {
    // Per-element state pills (LIVE green / OFFLINE red)
    document.querySelectorAll('[data-bot]').forEach(el => {
      const keys = el.getAttribute('data-bot').split(',').map(s => s.trim()).filter(Boolean);
      if (keys.length === 0) return;
      const old = el.querySelector(':scope > .bot-state');
      if (old) old.remove();
      const { state, bot } = aggregate(keys, bots);
      if (!bot) return;
      const span = document.createElement('span');
      span.className = 'bot-state bot-state--' + state;
      const iconHtml = state === 'online' ? SVG.cast : '';
      span.innerHTML = iconHtml + '<span>' + STATE[state].text + '</span>';
      span.title = bot.label + ': ' + STATE[state].tip;
      el.appendChild(document.createTextNode(' '));
      el.appendChild(span);
    });

    renderStatusBanner(bots);
  }

  // Same-origin first (works on docs.kinghive.games and internal docs server),
  // then cross-origin fallback for GH Pages mirror (CORS enabled on docs-public).
  const REMOTE_STATES = 'https://docs.kinghive.games/bot-states.json';
  async function fetchStates() {
    try {
      const r = await fetch('bot-states.json?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (_) {}
    try {
      const r = await fetch(REMOTE_STATES + '?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (_) {}
    return null;
  }
  async function load() {
    const data = await fetchStates();
    if (data) decorate(data.bots || {});
  }

  // Hash navigation: expand the target card and scroll to it
  function expandHashTarget() {
    const id = location.hash.slice(1);
    if (!id) return;
    const card = document.querySelector('.section-card[data-section-id="' + CSS.escape(id) + '"]');
    if (card && card.__collapsed) {
      userState[id] = false;
      saveUserState();
      applyCardCollapse(card, false);
    }
    // Reset filters when jumping
    const allBtn = document.querySelector('.doc-filter-pill[data-filter="all"]');
    if (allBtn && !allBtn.classList.contains('active')) allBtn.click();
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Init ──
  if (isGuidePage) {
    buildCards();
    buildSearchBar();
    buildFilterPills();
  }
  window.addEventListener('hashchange', expandHashTarget);
  if (location.hash) setTimeout(expandHashTarget, 100);

  load();
  setInterval(load, 60000);
})();
