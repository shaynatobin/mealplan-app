/* ════════════════════════════════════════════════════
   MEAL PLAN APP — app.js
   Phase: 1 (shell) + 2 (load week) + 3 (meal plan view)
════════════════════════════════════════════════════ */

/* ─── FIREBASE CONFIG ─────────────────────────────── */
const FIREBASE_URL = 'https://mealplan-app-a267f-default-rtdb.firebaseio.com';

const FB = {
  async getWeek() {
    try {
      const res = await fetch(`${FIREBASE_URL}/weekData.json`);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },
  async setWeek(data) {
    try {
      await fetch(`${FIREBASE_URL}/weekData.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch { /* offline — localStorage already saved */ }
  },
};

/* ─── DEFAULTS ────────────────────────────────────── */
const DEFAULT_TARGETS = {
  shane:  { protein: 165, carbs: 260, fat: 30, fiber: 38, calories: 2050 },
  shayna: { protein: 130, carbs: 172, fat: 60, fiber: 25, calories: 1750 },
};

/* ─── STATE ───────────────────────────────────────── */
const state = {
  week:        null,   // parsed weekData JSON
  person:      'shane',
  activeTab:   'plan',
  boosts:      {},     // { "2025-06-30": { protein: 30, carbs: 60 } }
  swaps:       { shane: {}, shayna: {} }, // { "2025-06-30_dinner": mealObj }
  notes:       { shane: {}, shayna: {} }, // { "2025-06-30": "text" }
  grocery:     {},     // { itemId: true/false }
  targets:     { shane: { ...DEFAULT_TARGETS.shane }, shayna: { ...DEFAULT_TARGETS.shayna } },
  usdaKey:     'DEMO_KEY',
};

/* ─── localStorage HELPERS ────────────────────────── */
const LS = {
  get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ } },
};

function loadFromStorage() {
  state.week    = LS.get('mp_weekData');
  state.boosts  = LS.get('mp_boosts')         || {};
  state.grocery = LS.get('mp_groceryChecked') || {};
  state.notes.shane  = LS.get('mp_notes_shane')  || {};
  state.notes.shayna = LS.get('mp_notes_shayna') || {};
  state.swaps.shane  = LS.get('mp_swaps_shane')  || {};
  state.swaps.shayna = LS.get('mp_swaps_shayna') || {};

  const st = LS.get('mp_targets_shane');
  const sy = LS.get('mp_targets_shayna');
  if (st) state.targets.shane  = st;
  if (sy) state.targets.shayna = sy;

  state.usdaKey = LS.get('mp_usdaKey') || 'DEMO_KEY';
}

function saveBoosts()   { LS.set('mp_boosts',          state.boosts); }
function saveGrocery()  { LS.set('mp_groceryChecked',  state.grocery); }
function saveNotes()    {
  LS.set('mp_notes_shane',  state.notes.shane);
  LS.set('mp_notes_shayna', state.notes.shayna);
}
function saveSwaps()    {
  LS.set('mp_swaps_shane',  state.swaps.shane);
  LS.set('mp_swaps_shayna', state.swaps.shayna);
}
function saveTargets()  {
  LS.set('mp_targets_shane',  state.targets.shane);
  LS.set('mp_targets_shayna', state.targets.shayna);
}

/* ─── TOAST ───────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, ms = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'fade-out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.classList.add('hidden'), 350);
  }, ms);
}

/* ─── PERSON THEMING ──────────────────────────────── */
function applyPersonTheme(person) {
  const root = document.documentElement;
  const colors = {
    shane:  { color: '#2D4A3E', light: '#e8f0ee' },
    shayna: { color: '#7B4F71', light: '#f3eaf1' },
  };
  const c = colors[person];
  root.style.setProperty('--person', c.color);
  root.style.setProperty('--person-light', c.light);

  document.getElementById('app-header').style.background = c.color;
  document.getElementById('meta-theme-color').setAttribute('content', c.color);

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === state.activeTab);
  });
}

/* ─── TAB NAVIGATION ──────────────────────────────── */
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

/* ─── DATE HELPERS ────────────────────────────────── */
function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDate();
}

function pct(val, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((val / target) * 100));
}

/* ─── MACRO CALCULATIONS ──────────────────────────── */
function getDayTotals(person, dateStr) {
  const week = state.week;
  if (!week) return null;

  const days = week[person]?.days || [];
  const day = days.find(d => d.date === dateStr);
  if (!day) return null;

  const swapKey = (mealType) => `${dateStr}_${mealType}`;
  const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];

  let totals = { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 };

  mealTypes.forEach(mt => {
    const swap = state.swaps[person][swapKey(mt)];
    const meal = swap || day.meals[mt];
    if (!meal || !meal.macros) return;
    const m = meal.macros;
    totals.protein  += m.protein  || 0;
    totals.carbs    += m.carbs    || 0;
    totals.fat      += m.fat      || 0;
    totals.calories += m.calories || 0;
    totals.fiber    += m.fiber    || 0;
  });

  // Add boost (Shane only)
  if (person === 'shane') {
    const boost = state.boosts[dateStr];
    if (boost) {
      totals.protein  += boost.protein || 0;
      totals.carbs    += boost.carbs   || 0;
      totals.calories += ((boost.protein || 0) * 4) + ((boost.carbs || 0) * 4);
    }
  }

  return totals;
}

function isOnTarget(totals, person) {
  const t = state.targets[person];
  const keys = ['protein', 'carbs', 'fat', 'calories'];
  return keys.every(k => {
    if (!t[k]) return true;
    const ratio = totals[k] / t[k];
    return ratio >= 0.9 && ratio <= 1.1;
  });
}

function isOffTarget(totals, person) {
  const t = state.targets[person];
  const keys = ['protein', 'carbs', 'fat', 'calories'];
  return keys.some(k => {
    if (!t[k]) return false;
    const ratio = totals[k] / t[k];
    return ratio < 0.9 || ratio > 1.1;
  });
}

/* ─── RENDER: MACRO BARS ──────────────────────────── */
function renderMacroBars(totals, person, includeNumbers = true) {
  const t = state.targets[person];
  const rows = [
    { key: 'protein',  label: 'Pro',  unit: 'g' },
    { key: 'carbs',    label: 'Carb', unit: 'g' },
    { key: 'fat',      label: 'Fat',  unit: 'g' },
    { key: 'calories', label: 'kcal', unit: '' },
  ];

  return `
    <div class="macro-row">
      ${rows.map(r => {
        const val = Math.round(totals[r.key] || 0);
        const tgt = t[r.key] || 0;
        return `
          <div class="macro-item">
            <div class="macro-val">${val}${r.unit}</div>
            ${includeNumbers ? `<div class="macro-target">/ ${tgt}${r.unit}</div>` : ''}
            <div class="macro-label">${r.label}</div>
          </div>`;
      }).join('')}
    </div>
    <div class="macro-bars">
      ${rows.map(r => {
        const val = totals[r.key] || 0;
        const tgt = t[r.key] || 1;
        const p = pct(val, tgt);
        const over = val > tgt;
        return `
          <div class="macro-bar-wrap">
            <div class="macro-bar-label">${r.label}</div>
            <div class="macro-bar-track">
              <div class="macro-bar-fill ${over ? 'over' : ''}" style="width:${p}%"></div>
            </div>
            <div class="macro-bar-pct">${p}%</div>
          </div>`;
      }).join('')}
    </div>`;
}

/* ─── RENDER: MEAL SECTION ────────────────────────── */
function renderMealSection(person, dateStr, mealType, mealData, dayData) {
  if (!mealData) return '';

  const mealTypeLabels = {
    breakfast: '🌅 Breakfast',
    lunch:     '☀️ Lunch',
    snacks:    '🍎 Snacks',
    dinner:    '🍽️ Dinner',
  };

  const swapKey = `${dateStr}_${mealType}`;
  const hasSwap = !!state.swaps[person][swapKey];
  const displayMeal = state.swaps[person][swapKey] || mealData;
  const m = displayMeal.macros || {};

  const itemsHtml = (displayMeal.items || [])
    .map(i => `<div class="meal-item">• ${i}</div>`)
    .join('');

  const gfHtml = dayData.meals[mealType]?.gfSwap
    ? `<div class="gf-note">🌾 GF swap: ${dayData.meals[mealType].gfSwap}</div>`
    : '';

  return `
    <div class="meal-section">
      <div class="meal-header">
        <div class="meal-name-wrap">
          <div class="meal-type-label">${mealTypeLabels[mealType] || mealType}</div>
          <div class="meal-name">${displayMeal.name || '—'}${hasSwap ? ' <span class="badge badge-modified">↻ swapped</span>' : ''}</div>
        </div>
        <div class="meal-macros-inline">
          ${Math.round(m.calories || 0)} kcal<br/>
          P${Math.round(m.protein || 0)} C${Math.round(m.carbs || 0)} F${Math.round(m.fat || 0)}
        </div>
      </div>
      <div class="meal-items">${itemsHtml}</div>
      ${gfHtml}
      <div class="meal-footer">
        ${hasSwap ? `<button class="btn-restore" data-person="${person}" data-date="${dateStr}" data-meal="${mealType}">Restore original</button>` : ''}
        <button class="btn-swap" data-person="${person}" data-date="${dateStr}" data-meal="${mealType}" data-meal-name="${(displayMeal.name || '').replace(/"/g, '&quot;')}">Swap</button>
      </div>
    </div>`;
}

/* ─── RENDER: BOOST PANEL ─────────────────────────── */
function renderBoostPanel(dateStr) {
  const boost = state.boosts[dateStr] || { protein: 0, carbs: 0 };
  const hasBoost = boost.protein > 0 || boost.carbs > 0;
  const extraKcal = (boost.protein * 4) + (boost.carbs * 4);

  return `
    <div class="boost-section" id="boost-section-${dateStr}">
      <div class="boost-trigger">
        <span class="text-muted" style="font-size:0.82rem">Double workout day?</span>
        <button class="btn-boost" id="boost-toggle-${dateStr}">🏋️ ${hasBoost ? 'Edit Boost' : '+ Workout Boost'}</button>
      </div>
      <div class="boost-panel ${hasBoost ? '' : 'hidden'}" id="boost-panel-${dateStr}">
        <div class="boost-row">
          <div class="boost-row-label">Extra Protein</div>
          <div class="stepper" id="stepper-protein-${dateStr}">
            <button class="stepper-btn" data-date="${dateStr}" data-macro="protein" data-dir="-1">−</button>
            <div class="stepper-val" id="stepper-val-protein-${dateStr}">${boost.protein}g</div>
            <button class="stepper-btn" data-date="${dateStr}" data-macro="protein" data-dir="1">+</button>
          </div>
        </div>
        <div class="boost-row">
          <div class="boost-row-label">Extra Carbs</div>
          <div class="stepper" id="stepper-carbs-${dateStr}">
            <button class="stepper-btn" data-date="${dateStr}" data-macro="carbs" data-dir="-1">−</button>
            <div class="stepper-val" id="stepper-val-carbs-${dateStr}">${boost.carbs}g</div>
            <button class="stepper-btn" data-date="${dateStr}" data-macro="carbs" data-dir="1">+</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="boost-extra-kcal" id="boost-kcal-${dateStr}">+${extraKcal} kcal</div>
          <button class="boost-clear" data-date="${dateStr}">Clear boost</button>
        </div>
      </div>
    </div>`;
}

/* ─── RENDER: NOTES SECTION ───────────────────────── */
function renderNotesSection(person, dateStr) {
  const note = state.notes[person][dateStr] || '';
  return `
    <div class="notes-section">
      <div class="notes-label">📓 Notes</div>
      <textarea
        class="notes-textarea"
        maxlength="200"
        placeholder="Add a note for this day…"
        data-person="${person}"
        data-date="${dateStr}"
      >${note}</textarea>
      <div class="notes-char-count">${note.length}/200</div>
    </div>`;
}

/* ─── RENDER: DAY CARD ────────────────────────────── */
function renderDayCard(person, dayData) {
  const dateStr = dayData.date;
  const dateNum = fmtDate(dateStr);
  const label   = dayData.dayLabel || '';

  const isFreeNight = dayData.freeNight;
  const totals = getDayTotals(person, dateStr);
  const onTarget  = totals && isOnTarget(totals, person);
  const offTarget = totals && isOffTarget(totals, person);

  const boost    = state.boosts[dateStr] || {};
  const hasBoost = person === 'shane' && (boost.protein > 0 || boost.carbs > 0);
  const hasNote  = !!(state.notes[person][dateStr]);

  const dinnerMeal = dayData.meals.dinner;
  const dinnerName = isFreeNight ? '🎉 Free Night'
    : (state.swaps[person][`${dateStr}_dinner`]?.name || dinnerMeal?.name || '—');
  const dayKcal = totals ? Math.round(totals.calories) : '—';

  const caloriePct = totals ? pct(totals.calories, state.targets[person].calories) : 0;

  let badges = '';
  if (onTarget)  badges += `<span class="badge badge-success">✓</span>`;
  if (offTarget) badges += `<span class="badge badge-warn">⚠</span>`;
  if (hasBoost)  badges += `<span class="badge badge-boost">🏋️</span>`;
  if (hasNote)   badges += `<span class="badge badge-note">📓</span>`;
  if (isFreeNight) badges += `<span class="badge badge-free">🎉</span>`;

  /* ── Expanded body ── */
  const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];
  const mealsHtml = mealTypes.map(mt => {
    if (mt === 'dinner' && isFreeNight) {
      return `<div class="free-night-card">🎉 Free Night — enjoy your evening!</div>`;
    }
    const meal = dayData.meals[mt];
    if (!meal) return '';
    return renderMealSection(person, dateStr, mt, meal, dayData);
  }).join('');

  const boostHtml = (person === 'shane') ? renderBoostPanel(dateStr) : '';
  const notesHtml = renderNotesSection(person, dateStr);

  return `
    <div class="day-card" id="day-card-${dateStr}" data-date="${dateStr}">
      <div class="day-card-header" data-date="${dateStr}">
        <div class="day-label-wrap">
          <div class="day-label">${label}</div>
          <div class="day-date">${dateNum}</div>
        </div>
        <div class="day-card-info">
          <div class="day-dinner-name">${dinnerName}</div>
          <div class="day-kcal">${dayKcal} kcal</div>
          <div class="day-macro-mini">
            <div class="day-macro-mini-fill" style="width:${caloriePct}%"></div>
          </div>
        </div>
        <div class="day-card-badges">${badges}</div>
        <div class="day-chevron">▾</div>
      </div>
      <div class="day-card-body">
        <div class="daily-macros">
          ${totals ? renderMacroBars(totals, person) : '<div class="text-muted">No data</div>'}
        </div>
        ${mealsHtml}
        ${boostHtml}
        ${notesHtml}
      </div>
    </div>`;
}

/* ─── RENDER: PLAN TAB ────────────────────────────── */
function renderPlanTab(person) {
  const container = document.getElementById('day-cards');
  const week = state.week;
  if (!week || !week[person]) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <div class="empty-state-title">No week loaded</div>
        <div class="empty-state-desc">Go to Settings → Load New Week to get started.</div>
      </div>`;
    return;
  }

  const days = week[person].days || [];
  container.innerHTML = days.map(d => renderDayCard(person, d)).join('');
  bindDayCardEvents();
}

/* ─── BIND: DAY CARD EVENTS ───────────────────────── */
function bindDayCardEvents() {
  /* Expand/collapse */
  document.querySelectorAll('.day-card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      /* Don't toggle if clicking an inner button */
      if (e.target.closest('button')) return;
      const dateStr = header.dataset.date;
      const card = document.getElementById(`day-card-${dateStr}`);
      card.classList.toggle('expanded');
    });
  });

  /* Boost toggle */
  document.querySelectorAll('[id^="boost-toggle-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dateStr = btn.id.replace('boost-toggle-', '');
      const panel = document.getElementById(`boost-panel-${dateStr}`);
      panel.classList.toggle('hidden');
    });
  });

  /* Stepper buttons */
  document.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { date, macro, dir } = btn.dataset;
      const step = 5;
      const maxes = { protein: 80, carbs: 150 };
      if (!state.boosts[date]) state.boosts[date] = { protein: 0, carbs: 0 };
      const boost = state.boosts[date];
      boost[macro] = Math.max(0, Math.min(maxes[macro], boost[macro] + (parseInt(dir) * step)));
      saveBoosts();
      refreshDayCard(state.person, date);
    });
  });

  /* Clear boost */
  document.querySelectorAll('.boost-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      state.boosts[date] = { protein: 0, carbs: 0 };
      saveBoosts();
      refreshDayCard(state.person, date);
    });
  });

  /* Swap buttons */
  document.querySelectorAll('.btn-swap').forEach(btn => {
    btn.addEventListener('click', () => {
      openSwapModal(btn.dataset.person, btn.dataset.date, btn.dataset.meal, btn.dataset.mealName);
    });
  });

  /* Restore buttons */
  document.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', () => {
      const { person, date, meal } = btn.dataset;
      const key = `${date}_${meal}`;
      delete state.swaps[person][key];
      saveSwaps();
      refreshDayCard(person, date);
      showToast('Meal restored to original');
    });
  });

  /* Notes textarea */
  document.querySelectorAll('.notes-textarea').forEach(ta => {
    const updateCount = () => {
      const count = ta.value.length;
      const sibling = ta.nextElementSibling;
      if (sibling) sibling.textContent = `${count}/200`;
    };
    ta.addEventListener('input', updateCount);
    ta.addEventListener('blur', () => {
      const { person, date } = ta.dataset;
      state.notes[person][date] = ta.value.trim();
      saveNotes();
      /* refresh badge on card header without collapsing */
      updateDayCardBadges(date, person);
    });
  });
}

/* ─── REFRESH: single day card (preserve expand state) */
function refreshDayCard(person, dateStr) {
  const oldCard = document.getElementById(`day-card-${dateStr}`);
  if (!oldCard) return;
  const wasExpanded = oldCard.classList.contains('expanded');

  const week = state.week;
  if (!week || !week[person]) return;
  const days = week[person].days || [];
  const dayData = days.find(d => d.date === dateStr);
  if (!dayData) return;

  const tmp = document.createElement('div');
  tmp.innerHTML = renderDayCard(person, dayData);
  const newCard = tmp.firstElementChild;
  if (wasExpanded) newCard.classList.add('expanded');

  oldCard.replaceWith(newCard);
  bindDayCardEvents();
}

/* ─── UPDATE: just the badges on a card header ────── */
function updateDayCardBadges(dateStr, person) {
  const card = document.getElementById(`day-card-${dateStr}`);
  if (!card) return;
  const totals   = getDayTotals(person, dateStr);
  const onTarget  = totals && isOnTarget(totals, person);
  const offTarget = totals && isOffTarget(totals, person);
  const boost = state.boosts[dateStr] || {};
  const hasBoost  = person === 'shane' && (boost.protein > 0 || boost.carbs > 0);
  const hasNote   = !!(state.notes[person][dateStr]);
  const isFreeNight = card.querySelector('.free-night-card') !== null;

  let badges = '';
  if (onTarget)   badges += `<span class="badge badge-success">✓</span>`;
  if (offTarget)  badges += `<span class="badge badge-warn">⚠</span>`;
  if (hasBoost)   badges += `<span class="badge badge-boost">🏋️</span>`;
  if (hasNote)    badges += `<span class="badge badge-note">📓</span>`;
  if (isFreeNight) badges += `<span class="badge badge-free">🎉</span>`;

  const badgeEl = card.querySelector('.day-card-badges');
  if (badgeEl) badgeEl.innerHTML = badges;
}

/* ─── RENDER: GROCERY TAB ────────────────────────────*/
function renderGroceryTab() {
  const container = document.getElementById('grocery-list');
  const week = state.week;
  if (!week || !week.grocery) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-title">No grocery list</div>
        <div class="empty-state-desc">Load a week to see your grocery list.</div>
      </div>`;
    return;
  }

  const sections = [
    { key: 'produce',  emoji: '🥦', label: 'Produce' },
    { key: 'proteins', emoji: '🍗', label: 'Proteins' },
    { key: 'pantry',   emoji: '🏪', label: 'Pantry' },
    { key: 'dairy',    emoji: '🥛', label: 'Dairy & Other' },
    { key: 'frozen',   emoji: '❄️', label: 'Frozen' },
  ];

  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'need';

  let html = '';
  sections.forEach(sec => {
    const items = week.grocery[sec.key] || [];
    if (!items.length) return;

    const filtered = items.filter(item => {
      const id = groceryItemId(sec.key, item.name);
      const checked = !!state.grocery[id];
      if (activeFilter === 'need') return !item.have && !checked;
      if (activeFilter === 'have') return item.have || checked;
      return true;
    });

    if (!filtered.length && activeFilter !== 'all') return;

    html += `<div class="grocery-section">
      <div class="grocery-section-header">${sec.emoji} ${sec.label}</div>`;

    filtered.forEach(item => {
      const id = groceryItemId(sec.key, item.name);
      const checked = !!state.grocery[id];
      const gfBadge = item.gf ? `<span class="gf-badge">GF</span>` : '';
      const addedBadge = item._added ? `<span class="added-badge">⚡ Added</span>` : '';

      html += `
        <div class="grocery-item ${checked ? 'checked' : ''}" data-id="${id}">
          <div class="grocery-check">${checked ? '✓' : ''}</div>
          <div class="grocery-item-name">${item.name}</div>
          ${gfBadge}${addedBadge}
        </div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html || `<div class="empty-state"><div class="empty-state-desc">No items match this filter.</div></div>`;
  bindGroceryEvents();
}

function groceryItemId(section, name) {
  return `${section}_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

function bindGroceryEvents() {
  document.querySelectorAll('.grocery-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      state.grocery[id] = !state.grocery[id];
      saveGrocery();
      renderGroceryTab();
    });
  });
}

/* ─── RENDER: PREP TAB ────────────────────────────── */
function renderPrepTab() {
  const container = document.getElementById('prep-cards');
  const week = state.week;
  if (!week || !week.prep || !week.prep.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🍳</div>
        <div class="empty-state-title">No prep guide</div>
        <div class="empty-state-desc">Load a week to see the prep guide.</div>
      </div>`;
    return;
  }

  container.innerHTML = week.prep.map(card => `
    <div class="prep-card">
      <div class="prep-card-header">
        <span class="prep-card-emoji">${card.emoji || '🍳'}</span>
        <span class="prep-card-title">${card.title || ''}</span>
      </div>
      <div class="prep-card-body">${card.body || ''}</div>
      ${card.reheat ? `<div class="prep-reheat"><strong>Reheat:</strong> ${card.reheat}</div>` : ''}
    </div>
  `).join('');
}

/* ─── RENDER: SETTINGS TAB ────────────────────────── */
function renderSettingsTab() {
  const container = document.getElementById('settings-content');
  const t = state.targets;
  const week = state.week;

  const macroFieldsFor = (person, label, colorClass) => {
    const fields = [
      { key: 'protein',  label: 'Protein (g)' },
      { key: 'carbs',    label: 'Carbs (g)' },
      { key: 'fat',      label: 'Fat (g)' },
      { key: 'fiber',    label: 'Fiber (g)' },
      { key: 'calories', label: 'Calories' },
    ];
    return `
      <div class="settings-card">
        <div class="settings-person-label ${colorClass}">${label}</div>
        <div class="macro-target-grid">
          ${fields.map(f => `
            <div class="macro-target-field">
              <label>${f.label}</label>
              <input
                type="number" min="0"
                value="${t[person][f.key] || 0}"
                data-person="${person}"
                data-key="${f.key}"
                class="target-input"
              />
            </div>`).join('')}
        </div>
        <button class="btn btn-outline btn-sm" data-person="${person}" data-action="reset-targets">
          Reset to defaults
        </button>
      </div>`;
  };

  container.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">📊 Macro Targets</div>
      ${macroFieldsFor('shane',  '💪 Shane',  'shane')}
      ${macroFieldsFor('shayna', '🌿 Shayna', 'shayna')}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🔑 USDA API Key</div>
      <div class="settings-card">
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.75rem;line-height:1.6">
          DEMO_KEY works for personal use (30 req/hour). Get your free key at
          <a href="https://fdc.nal.usda.gov/api-guide.html" target="_blank">fdc.nal.usda.gov</a>.
        </p>
        <input
          type="text"
          class="settings-input"
          id="usda-key-input"
          value="${state.usdaKey}"
          placeholder="DEMO_KEY"
          style="width:100%"
        />
        <button class="btn btn-outline btn-sm" id="save-usda-key" style="margin-top:0.5rem">Save Key</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📋 Load New Week</div>
      <div class="settings-card">
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.75rem;line-height:1.6">
          Paste the JSON block from your weekly meal planning prompt each Sunday.
        </p>
        <button class="btn btn-primary" id="settings-load-week-btn" style="width:100%">📋 Load New Week</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">⬇️ MFP Export</div>
      <div class="settings-card">
        <div style="display:flex;gap:0.75rem;margin-bottom:1rem">
          <button class="btn btn-outline" id="export-shane-btn" style="flex:1">⬇ Shane's Week</button>
          <button class="btn btn-outline" id="export-shayna-btn" style="flex:1">⬇ Shayna's Week</button>
        </div>
      </div>
      <div class="mfp-instructions">
        <strong>How to import into MyFitnessPal:</strong>
        <ol>
          <li>Download the CSV file above</li>
          <li>Open MyFitnessPal on desktop → Food → Import Food Diary</li>
          <li>Select the CSV file and map columns</li>
          <li>Confirm the import — meals will appear in your diary</li>
        </ol>
      </div>
    </div>

    <div class="app-info">
      <div><strong>Meal Plan App</strong> v1.0</div>
      <div>Week: ${week?.weekOf || 'No week loaded'}</div>
    </div>`;

  bindSettingsEvents();
}

function bindSettingsEvents() {
  /* Macro target inputs */
  document.querySelectorAll('.target-input').forEach(input => {
    input.addEventListener('change', () => {
      const { person, key } = input.dataset;
      const val = parseInt(input.value, 10) || 0;
      state.targets[person][key] = val;
      saveTargets();
      if (state.activeTab === 'plan') renderPlanTab(state.person);
    });
  });

  /* Reset targets */
  document.querySelectorAll('[data-action="reset-targets"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const person = btn.dataset.person;
      state.targets[person] = { ...DEFAULT_TARGETS[person] };
      saveTargets();
      renderSettingsTab();
      if (state.activeTab === 'plan') renderPlanTab(state.person);
      showToast('Targets reset to defaults');
    });
  });

  /* USDA key */
  document.getElementById('save-usda-key')?.addEventListener('click', () => {
    const key = document.getElementById('usda-key-input').value.trim() || 'DEMO_KEY';
    state.usdaKey = key;
    LS.set('mp_usdaKey', key);
    showToast('API key saved');
  });

  /* Load week from settings */
  document.getElementById('settings-load-week-btn')?.addEventListener('click', openLoadWeekModal);

  /* MFP export */
  document.getElementById('export-shane-btn')?.addEventListener('click', () => exportMFP('shane'));
  document.getElementById('export-shayna-btn')?.addEventListener('click', () => exportMFP('shayna'));
}

/* ─── MFP CSV EXPORT ──────────────────────────────── */
function exportMFP(person) {
  const week = state.week;
  if (!week || !week[person]) { showToast('No week loaded'); return; }

  const rows = [['Date', 'Meal', 'Food Name', 'Amount', 'Unit', 'Calories', 'Carbohydrates (g)', 'Fat (g)', 'Protein (g)', 'Sodium (mg)', 'Sugar (g)']];
  const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];
  const mealLabels = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };

  (week[person].days || []).forEach(day => {
    const dateStr = day.date;

    mealTypes.forEach(mt => {
      /* Shayna: skip dinner on free nights */
      if (mt === 'dinner' && day.freeNight) return;

      const swapKey = `${dateStr}_${mt}`;
      const meal = state.swaps[person][swapKey] || day.meals[mt];
      if (!meal) return;

      const m = meal.macros || {};
      rows.push([
        dateStr,
        mealLabels[mt],
        meal.name || '',
        1,
        'serving',
        Math.round(m.calories || 0),
        Math.round(m.carbs    || 0),
        Math.round(m.fat      || 0),
        Math.round(m.protein  || 0),
        Math.round(m.sodium   || 0),
        Math.round(m.sugar    || 0),
      ]);
    });

    /* Shane boost line */
    if (person === 'shane') {
      const boost = state.boosts[dateStr];
      if (boost && (boost.protein > 0 || boost.carbs > 0)) {
        const boostKcal = (boost.protein * 4) + (boost.carbs * 4);
        rows.push([
          dateStr, 'Snacks', 'Workout Boost', 1, 'serving',
          boostKcal, boost.carbs || 0, 0, boost.protein || 0, 0, 0,
        ]);
      }
    }
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${person}_mfp_${week.weekStart || 'week'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${person === 'shane' ? 'Shane' : 'Shayna'}'s CSV exported`);
}

/* ─── LOAD WEEK MODAL ─────────────────────────────── */
function openLoadWeekModal() {
  const overlay = document.getElementById('modal-load-week');
  overlay.classList.remove('hidden');
  document.getElementById('json-paste-area').value = '';
  document.getElementById('json-error').classList.add('hidden');
}

function closeLoadWeekModal() {
  document.getElementById('modal-load-week').classList.add('hidden');
}

function validateAndLoadWeek() {
  const raw = document.getElementById('json-paste-area').value.trim();
  const errEl = document.getElementById('json-error');

  if (!raw) {
    errEl.textContent = 'Please paste your weekly JSON first.';
    errEl.classList.remove('hidden');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errEl.textContent = `Invalid JSON: ${e.message}`;
    errEl.classList.remove('hidden');
    return;
  }

  /* Basic schema validation */
  const issues = [];
  if (!parsed.weekOf)    issues.push('Missing "weekOf" field');
  if (!parsed.weekStart) issues.push('Missing "weekStart" field');
  if (!parsed.shane?.days?.length) issues.push('Missing "shane.days" array');
  if (!parsed.shayna?.days?.length) issues.push('Missing "shayna.days" array');

  if (issues.length) {
    errEl.innerHTML = 'Validation errors:<br>• ' + issues.join('<br>• ');
    errEl.classList.remove('hidden');
    return;
  }

  /* All good — save locally, push to Firebase, and render */
  state.week = parsed;
  LS.set('mp_weekData', parsed);
  FB.setWeek(parsed);
  closeLoadWeekModal();
  showApp();
  renderPlanTab(state.person);
  renderGroceryTab();
  renderPrepTab();
  renderSettingsTab();
  showToast(`Loaded: ${parsed.weekOf}`);
}

/* ─── SHOW / HIDE SCREENS ─────────────────────────── */
function showApp() {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('header-week').textContent = state.week?.weekOf || '';
}

function showWelcome() {
  document.getElementById('welcome-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

/* ─── SWAP MODAL ──────────────────────────────────── */
/* Swap state */
const swapCtx = {
  person: null, date: null, meal: null,
  pendingFood: null, pendingServingG: null,
  searchSource: 'usda',
  scanner: null,
};

function openSwapModal(person, date, meal, mealName) {
  swapCtx.person = person;
  swapCtx.date   = date;
  swapCtx.meal   = meal;
  swapCtx.pendingFood = null;

  document.getElementById('swap-modal-title').textContent = `Swap: ${mealName}`;
  document.getElementById('modal-swap').classList.remove('hidden');
  document.getElementById('swap-search-panel').classList.remove('hidden');
  document.getElementById('swap-scan-panel').classList.add('hidden');
  document.getElementById('swap-confirm-panel').classList.add('hidden');
  document.getElementById('swap-search-results').innerHTML = '';
  document.getElementById('swap-search-input').value = '';

  /* Reset mode buttons */
  document.getElementById('swap-mode-search').classList.add('active');
  document.getElementById('swap-mode-scan').classList.remove('active');
}

function closeSwapModal() {
  document.getElementById('modal-swap').classList.add('hidden');
  if (swapCtx.scanner) {
    swapCtx.scanner.stop().catch(() => {});
    swapCtx.scanner = null;
  }
}

function showSwapConfirm(food) {
  swapCtx.pendingFood = food;
  swapCtx.pendingServingG = food.servingG || 100;

  document.getElementById('swap-confirm-panel').classList.remove('hidden');
  renderSwapConfirmCard();
}

function renderSwapConfirmCard() {
  const food = swapCtx.pendingFood;
  if (!food) return;

  const factor = swapCtx.pendingServingG / (food.servingG || 100);
  const m = {
    calories: Math.round((food.calories || 0) * factor),
    protein:  Math.round((food.protein  || 0) * factor),
    carbs:    Math.round((food.carbs    || 0) * factor),
    fat:      Math.round((food.fat      || 0) * factor),
  };

  document.getElementById('swap-confirm-card').innerHTML = `
    <div class="confirm-food-name">${food.name}</div>
    <div class="serving-adjuster">
      <label>Serving (g):</label>
      <input type="number" class="serving-input" id="serving-input-val"
        value="${swapCtx.pendingServingG}" min="1" max="2000" />
    </div>
    <div class="confirm-macros">
      <div class="confirm-macro-item">
        <div class="confirm-macro-val">${m.calories}</div>
        <div class="confirm-macro-label">kcal</div>
      </div>
      <div class="confirm-macro-item">
        <div class="confirm-macro-val">${m.protein}g</div>
        <div class="confirm-macro-label">protein</div>
      </div>
      <div class="confirm-macro-item">
        <div class="confirm-macro-val">${m.carbs}g</div>
        <div class="confirm-macro-label">carbs</div>
      </div>
      <div class="confirm-macro-item">
        <div class="confirm-macro-val">${m.fat}g</div>
        <div class="confirm-macro-label">fat</div>
      </div>
    </div>`;

  document.getElementById('serving-input-val').addEventListener('input', (e) => {
    swapCtx.pendingServingG = parseFloat(e.target.value) || 100;
    renderSwapConfirmCard();
  });
}

function confirmSwap() {
  const food = swapCtx.pendingFood;
  if (!food) return;

  const factor = swapCtx.pendingServingG / (food.servingG || 100);
  const swapMeal = {
    name: food.name,
    items: [`${swapCtx.pendingServingG}g ${food.name}`],
    macros: {
      calories: Math.round((food.calories || 0) * factor),
      protein:  Math.round((food.protein  || 0) * factor),
      carbs:    Math.round((food.carbs    || 0) * factor),
      fat:      Math.round((food.fat      || 0) * factor),
    },
  };

  const key = `${swapCtx.date}_${swapCtx.meal}`;
  state.swaps[swapCtx.person][key] = swapMeal;
  saveSwaps();
  closeSwapModal();
  refreshDayCard(swapCtx.person, swapCtx.date);
  showToast('Meal swapped!');
}

/* ─── FOOD SEARCH ─────────────────────────────────── */
async function searchFoods(query, source) {
  const resultsEl = document.getElementById('swap-search-results');
  resultsEl.innerHTML = `<div class="search-loading"><div class="spinner"></div></div>`;

  try {
    let results = [];
    if (source === 'usda') {
      results = await searchUSDA(query);
    } else {
      results = await searchOFF(query);
    }

    if (!results.length) {
      resultsEl.innerHTML = `<div class="search-empty">No results found. Try different terms.</div>`;
      return;
    }

    resultsEl.innerHTML = results.map((item, i) => `
      <div class="search-result-item" data-idx="${i}">
        <div class="search-result-name">${item.name}</div>
        <div class="search-result-meta">${item.calories} kcal · P${item.protein}g C${item.carbs}g F${item.fat}g · per ${item.servingG}g</div>
      </div>`).join('');

    resultsEl.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const food = results[parseInt(el.dataset.idx)];
        showSwapConfirm(food);
      });
    });

  } catch (e) {
    resultsEl.innerHTML = `<div class="search-empty">Search failed: ${e.message}</div>`;
  }
}

async function searchUSDA(query) {
  const key = state.usdaKey || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${key}&pageSize=10&dataType=Foundation,SR%20Legacy`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA API error ${res.status}`);
  const data = await res.json();

  return (data.foods || []).map(f => {
    const nutr = (id) => (f.foodNutrients || []).find(n => n.nutrientId === id)?.value || 0;
    return {
      name:     f.description || f.lowercaseDescription || 'Unknown',
      servingG: 100,
      calories: Math.round(nutr(1008)),
      protein:  Math.round(nutr(1003)),
      carbs:    Math.round(nutr(1005)),
      fat:      Math.round(nutr(1004)),
    };
  }).filter(f => f.calories > 0);
}

async function searchOFF(query) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Food Facts error ${res.status}`);
  const data = await res.json();

  return (data.products || []).map(p => {
    const n = p.nutriments || {};
    const serving = p.serving_size ? parseFloat(p.serving_size) : 100;
    return {
      name:     p.product_name || p.generic_name || 'Unknown',
      servingG: isNaN(serving) ? 100 : serving,
      calories: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
      protein:  Math.round(n['proteins_serving']    || n['proteins_100g']    || 0),
      carbs:    Math.round(n['carbohydrates_serving']|| n['carbohydrates_100g']|| 0),
      fat:      Math.round(n['fat_serving']          || n['fat_100g']          || 0),
    };
  }).filter(p => p.name !== 'Unknown' && p.calories > 0);
}

async function lookupBarcode(barcode) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Barcode lookup failed');
  const data = await res.json();
  if (data.status !== 1) throw new Error('Product not found');

  const p = data.product;
  const n = p.nutriments || {};
  const serving = p.serving_size ? parseFloat(p.serving_size) : 100;
  return {
    name:     p.product_name || 'Unknown',
    servingG: isNaN(serving) ? 100 : serving,
    calories: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
    protein:  Math.round(n['proteins_serving']    || n['proteins_100g']    || 0),
    carbs:    Math.round(n['carbohydrates_serving']|| n['carbohydrates_100g']|| 0),
    fat:      Math.round(n['fat_serving']          || n['fat_100g']          || 0),
  };
}

/* ─── BARCODE SCANNER ─────────────────────────────── */
function startScanner() {
  if (!window.Html5Qrcode) {
    showToast('Scanner library not loaded');
    return;
  }

  document.getElementById('qr-reader').innerHTML = '';
  swapCtx.scanner = new Html5Qrcode('qr-reader');

  swapCtx.scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    async (code) => {
      swapCtx.scanner.stop().catch(() => {});
      swapCtx.scanner = null;

      const panel = document.getElementById('scan-result-panel');
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="search-loading"><div class="spinner"></div> Looking up barcode…</div>`;

      try {
        const food = await lookupBarcode(code);
        panel.innerHTML = '';
        showSwapConfirm(food);
      } catch (e) {
        panel.innerHTML = `<div class="search-empty">Barcode not found (${code}). Try searching instead.</div>`;
      }
    },
    () => {}
  ).catch(err => {
    showToast('Camera access denied');
    console.warn(err);
  });
}

/* ─── EVENT WIRING ────────────────────────────────── */
function bindGlobalEvents() {
  /* Bottom nav */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === 'grocery')  renderGroceryTab();
      if (btn.dataset.tab === 'prep')     renderPrepTab();
      if (btn.dataset.tab === 'settings') renderSettingsTab();
    });
  });

  /* Person toggle */
  document.querySelectorAll('.person-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.person-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.person = btn.dataset.person;
      applyPersonTheme(state.person);
      renderPlanTab(state.person);
    });
  });

  /* Grocery filters */
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGroceryTab();
    });
  });

  /* Grocery reset */
  document.getElementById('grocery-reset-btn')?.addEventListener('click', () => {
    if (confirm('Clear all grocery checkmarks?')) {
      state.grocery = {};
      saveGrocery();
      renderGroceryTab();
    }
  });

  /* Welcome load button */
  document.getElementById('welcome-load-btn')?.addEventListener('click', openLoadWeekModal);

  /* Load week modal */
  document.getElementById('load-week-back')?.addEventListener('click', closeLoadWeekModal);
  document.getElementById('load-week-cancel')?.addEventListener('click', closeLoadWeekModal);
  document.getElementById('load-week-confirm')?.addEventListener('click', validateAndLoadWeek);

  /* Close modal on overlay click */
  document.getElementById('modal-load-week')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLoadWeekModal();
  });

  /* Swap modal */
  document.getElementById('swap-back')?.addEventListener('click', closeSwapModal);

  /* Swap mode toggle */
  document.getElementById('swap-mode-search')?.addEventListener('click', () => {
    document.getElementById('swap-mode-search').classList.add('active');
    document.getElementById('swap-mode-scan').classList.remove('active');
    document.getElementById('swap-search-panel').classList.remove('hidden');
    document.getElementById('swap-scan-panel').classList.add('hidden');
    if (swapCtx.scanner) { swapCtx.scanner.stop().catch(() => {}); swapCtx.scanner = null; }
  });

  document.getElementById('swap-mode-scan')?.addEventListener('click', () => {
    document.getElementById('swap-mode-scan').classList.add('active');
    document.getElementById('swap-mode-search').classList.remove('active');
    document.getElementById('swap-scan-panel').classList.remove('hidden');
    document.getElementById('swap-search-panel').classList.add('hidden');
    startScanner();
  });

  /* Source toggle (USDA vs OFF) */
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      swapCtx.searchSource = btn.dataset.source;
    });
  });

  /* Search button & Enter key */
  const searchBtn   = document.getElementById('swap-search-btn');
  const searchInput = document.getElementById('swap-search-input');
  const doSearch = () => {
    const q = searchInput.value.trim();
    if (!q) return;
    searchFoods(q, swapCtx.searchSource);
  };
  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  /* Swap confirm / cancel */
  document.getElementById('swap-confirm-btn')?.addEventListener('click', confirmSwap);
  document.getElementById('swap-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('swap-confirm-panel').classList.add('hidden');
    swapCtx.pendingFood = null;
  });
}

/* ─── INIT ────────────────────────────────────────── */
async function init() {
  loadFromStorage();
  applyPersonTheme(state.person);
  bindGlobalEvents();

  /* Try to pull the latest week from Firebase */
  const remoteWeek = await FB.getWeek();
  if (remoteWeek && remoteWeek.weekStart) {
    const localStart  = state.week?.weekStart || '';
    const remoteStart = remoteWeek.weekStart  || '';
    /* Use whichever is newer */
    if (!state.week || remoteStart >= localStart) {
      state.week = remoteWeek;
      LS.set('mp_weekData', remoteWeek);
    }
  }

  if (state.week) {
    showApp();
    renderPlanTab(state.person);
  } else {
    showWelcome();
  }
}

document.addEventListener('DOMContentLoaded', init);
