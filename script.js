/* Page Pilot — script.js
   - Modal-based settings & bookmark editing (no more prompt/alert)
   - Widget registry with toggle on/off
   - Shortcut badges on bookmark tiles + "?" overlay
   - Toast notifications
   - XSS-safe rendering (textContent, no innerHTML with user data)
   - Double-buffer wallpaper with Unsplash / Picsum fallback
   - Clock + Weather, Bookmarks, To-Do widgets
*/

// ── Storage keys (kept from v1 for backward compat) ──
const KEYS = {
  wallpaperCurrent: 'bento.wallpaper.current',
  wallpaperNext:    'bento.wallpaper.next',
  unsplashKey:      'bento.unsplash.key',
  bookmarks:        'bento.bookmarks.v3',
  todos:            'bento.todos.v1',
  widgets:          'bento.widgets',
  legendDismissed:  'bento.legend.dismissed',
  notes:            'bento.notes',
  worldclocks:      'bento.worldclocks',
  pomoSessions:     'bento.pomo.sessions',
};

// ── DOM helpers ──
const $ = (s) => document.querySelector(s);
const BG = $('#bg');

// ══════════════════════════════════════════════════════
//  Toast notifications
// ══════════════════════════════════════════════════════
function toast(msg, type = 'info', ms = 3000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('#toastContainer').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove());
  }, ms);
}

// ══════════════════════════════════════════════════════
//  Modal system
// ══════════════════════════════════════════════════════
let _modalCleanup = null;

function openModal(title, buildFn) {
  const modal = $('#modal');
  const body = $('#modalBody');
  $('#modalTitle').textContent = title;
  body.innerHTML = '';
  buildFn(body);
  modal.classList.remove('hidden');
  const first = body.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
}

function closeModal() {
  $('#modal').classList.add('hidden');
  if (_modalCleanup) { _modalCleanup(); _modalCleanup = null; }
}

function modalConfirm(title, msg) {
  return new Promise(resolve => {
    openModal(title, body => {
      const p = document.createElement('p');
      p.textContent = msg;
      p.style.marginBottom = '4px';
      const row = document.createElement('div');
      row.className = 'modal-actions';
      const no = document.createElement('button');
      no.className = 'btn btn-ghost'; no.textContent = 'Cancel';
      no.onclick = () => { closeModal(); resolve(false); };
      const yes = document.createElement('button');
      yes.className = 'btn btn-primary'; yes.textContent = 'Confirm';
      yes.onclick = () => { closeModal(); resolve(true); };
      row.append(no, yes);
      body.append(p, row);
    });
    _modalCleanup = () => resolve(false);
  });
}

$('#modalClose').addEventListener('click', closeModal);
$('.modal-backdrop').addEventListener('click', closeModal);

// ══════════════════════════════════════════════════════
//  Widget registry & toggles
// ══════════════════════════════════════════════════════
const WIDGET_DEFS = [
  { id: 'clock',     name: 'Clock & Weather', icon: '🕐', on: true },
  { id: 'bookmarks', name: 'Bookmarks',       icon: '🔖', on: true },
  { id: 'todo',      name: 'To-Do',           icon: '✅', on: true },
];

function widgetPrefs()     { try { return JSON.parse(localStorage.getItem(KEYS.widgets)) || {}; } catch { return {}; } }
function saveWidgetPrefs(p){ localStorage.setItem(KEYS.widgets, JSON.stringify(p)); }
function widgetOn(id)      { const p = widgetPrefs(); return p[id] !== undefined ? p[id] : (WIDGET_DEFS.find(w => w.id === id)?.on ?? true); }

function applyWidgets() {
  WIDGET_DEFS.forEach(w => {
    const el = $(`[data-widget="${w.id}"]`);
    if (el) el.classList.toggle('widget-hidden', !widgetOn(w.id));
  });
  const bm = widgetOn('bookmarks'), td = widgetOn('todo');
  const bmEl = $('[data-widget="bookmarks"]');
  const tdEl = $('[data-widget="todo"]');
  if (bmEl) {
    bmEl.classList.toggle('span-12', bm && !td);
    bmEl.classList.toggle('bookmarks', !(bm && !td));
  }
  if (tdEl) {
    tdEl.classList.toggle('span-12', td && !bm);
    tdEl.classList.toggle('todo', !(td && !bm));
  }
}

// ══════════════════════════════════════════════════════
//  Wallpaper (double-buffer)
// ══════════════════════════════════════════════════════
function preloadImage(url) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(url);
    img.onerror = () => fail(new Error('img load fail'));
    img.src = url;
  });
}

async function fetchUnsplash(topic = 'landscape') {
  const key = localStorage.getItem(KEYS.unsplashKey) || '';
  if (!key) throw new Error('no-key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(
      `https://api.unsplash.com/photos/random?orientation=landscape&query=${encodeURIComponent(topic)}&content_filter=high&client_id=${key}`,
      { signal: ctrl.signal }
    );
    if (!r.ok) throw new Error('http-' + r.status);
    const d = await r.json();
    return d?.urls?.regular || d?.urls?.full || null;
  } finally { clearTimeout(t); }
}

async function fetchWallpaper(topic = 'landscape') {
  try { const u = await fetchUnsplash(topic); if (u) return u; } catch {}
  return `https://picsum.photos/1920/1080?random=${Date.now()}`;
}

async function initWallpaper() {
  const apply = (u) => { BG.style.backgroundImage = `url('${u}')`; };
  try {
    const next = localStorage.getItem(KEYS.wallpaperNext);
    const curr = localStorage.getItem(KEYS.wallpaperCurrent);
    if (next) {
      try { await preloadImage(next); } catch {}
      apply(next);
      localStorage.setItem(KEYS.wallpaperCurrent, next);
      localStorage.removeItem(KEYS.wallpaperNext);
    } else if (curr) {
      try { await preloadImage(curr); apply(curr); } catch { BG.style.background = '#0b1220'; }
    } else {
      const u = await fetchWallpaper();
      try { await preloadImage(u); apply(u); localStorage.setItem(KEYS.wallpaperCurrent, u); }
      catch { BG.style.background = '#0b1220'; }
    }
  } catch { BG.style.background = '#0b1220'; }
  // Pre-fetch next wallpaper in background
  (async () => {
    try {
      const u = await fetchWallpaper();
      try { await preloadImage(u); } catch {}
      localStorage.setItem(KEYS.wallpaperNext, u);
    } catch {}
  })();
}

// ══════════════════════════════════════════════════════
//  Clock
// ══════════════════════════════════════════════════════
function tickClock() {
  const now = new Date();
  $('#time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const msToNextMin = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
  setTimeout(tickClock, msToNextMin);
}
tickClock();

// ══════════════════════════════════════════════════════
//  Weather (Open-Meteo)
// ══════════════════════════════════════════════════════
const WX_MAP = {0:['Clear','☀️'],1:['Mainly clear','🌤️'],2:['Partly cloudy','⛅'],3:['Overcast','☁️'],45:['Fog','🌫️'],48:['Rime fog','🌫️'],51:['Light drizzle','🌦️'],53:['Drizzle','🌦️'],55:['Dense drizzle','🌧️'],61:['Slight rain','🌧️'],63:['Rain','🌧️'],65:['Heavy rain','🌧️'],71:['Slight snow','🌨️'],73:['Snow','🌨️'],75:['Heavy snow','🌨️'],80:['Rain showers','🌧️'],81:['Showers','🌧️'],82:['Heavy showers','⛈️'],95:['Thunderstorm','⛈️']};

async function fetchWeather(lat, lon) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json(), c = j.current_weather;
    if (!c) return;
    $('#wTemp').textContent = Math.round(c.temperature) + '°';
    const m = WX_MAP[c.weathercode] || ['Weather', '🌡️'];
    $('#wDesc').textContent = m[0];
    $('#wIcon').textContent = m[1];
    $('#wWind').textContent = Math.round(c.windspeed) + ' km/h';
    $('#wDay').textContent = c.is_day ? 'Day' : 'Night';
  } catch (e) { console.warn('weather error', e); }
}

function initWeather() {
  if (!('geolocation' in navigator)) { $('#wDesc').textContent = 'Geolocation unsupported'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    ()  => { $('#wDesc').textContent = 'Location blocked'; },
    { timeout: 8000 }
  );
}
initWeather();

// ══════════════════════════════════════════════════════
//  Bookmarks
// ══════════════════════════════════════════════════════
const DEFAULT_BM = [
  { name: 'Gmail',   url: 'https://mail.google.com', emoji: '📧', shortcut: 'm' },
  { name: 'YouTube', url: 'https://www.youtube.com',  emoji: '▶️', shortcut: 'y' },
  { name: 'Reddit',  url: 'https://www.reddit.com',   emoji: '👽', shortcut: 'r' },
  { name: 'GitHub',  url: 'https://github.com',       emoji: '🐙', shortcut: 'g' },
];
let bookmarks = JSON.parse(localStorage.getItem(KEYS.bookmarks) || 'null') || [...DEFAULT_BM];
function saveBM() { localStorage.setItem(KEYS.bookmarks, JSON.stringify(bookmarks)); }

function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function editBookmarkModal(initial, onSave) {
  openModal(initial ? 'Edit Bookmark' : 'Add Bookmark', body => {
    const form = document.createElement('form');
    form.className = 'bm-form';

    const fields = [
      { label: 'Emoji', name: 'emoji', value: initial?.emoji ?? '🌐', maxlength: '4', placeholder: '🌐' },
      { label: 'Name',  name: 'name',  value: initial?.name ?? '',    placeholder: 'Title', required: true },
      { label: 'URL',   name: 'url',   value: initial?.url ?? 'https://', placeholder: 'https://...', type: 'url', required: true },
      { label: 'Shortcut key', name: 'shortcut', value: initial?.shortcut ?? '', maxlength: '1', placeholder: 'Single letter (optional)' },
    ];

    fields.forEach(f => {
      const lbl = document.createElement('label');
      lbl.textContent = f.label;
      const inp = document.createElement('input');
      inp.className = 'input';
      inp.name = f.name;
      inp.value = f.value;
      if (f.maxlength) inp.maxLength = f.maxlength;
      if (f.placeholder) inp.placeholder = f.placeholder;
      if (f.required) inp.required = true;
      if (f.type) inp.type = f.type;
      lbl.appendChild(inp);
      form.appendChild(lbl);
    });

    const row = document.createElement('div');
    row.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-ghost'; cancel.textContent = 'Cancel';
    cancel.onclick = closeModal;
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'btn btn-primary'; save.textContent = 'Save';
    row.append(cancel, save);
    form.appendChild(row);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const url = fd.get('url').trim();
      if (!isValidUrl(url)) {
        form.querySelector('[name="url"]').classList.add('input-error');
        toast('Please enter a valid http/https URL', 'error');
        return;
      }
      onSave({
        emoji:    fd.get('emoji').trim() || '🌐',
        name:     fd.get('name').trim(),
        url:      url,
        shortcut: fd.get('shortcut').trim().slice(0, 1).toLowerCase(),
      });
      closeModal();
    });

    body.appendChild(form);
  });
}

function renderBookmarks() {
  const grid = $('#bmGrid');
  grid.innerHTML = '';

  if (bookmarks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No bookmarks yet. Click + Add to create one.';
    grid.appendChild(empty);
  }

  bookmarks.forEach((b, i) => {
    const a = document.createElement('a');
    a.className = 'bm';
    a.href = b.url;

    const emojiEl = document.createElement('div');
    emojiEl.className = 'emoji';
    emojiEl.textContent = b.emoji;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = b.name;

    a.append(emojiEl, label);

    // Shortcut badge
    if (b.shortcut) {
      const badge = document.createElement('kbd');
      badge.className = 'shortcut-badge';
      badge.textContent = b.shortcut.toUpperCase();
      a.appendChild(badge);
    }

    // Hover actions
    const actions = document.createElement('div');
    actions.className = 'actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn'; editBtn.textContent = '✏️';
    editBtn.setAttribute('aria-label', 'Edit bookmark');
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn'; delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete bookmark');
    actions.append(editBtn, delBtn);
    a.appendChild(actions);

    editBtn.addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      editBookmarkModal(b, updated => { bookmarks[i] = updated; saveBM(); renderBookmarks(); toast('Bookmark updated'); });
    });
    delBtn.addEventListener('click', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (await modalConfirm('Delete Bookmark', `Remove "${b.name}"?`)) {
        bookmarks.splice(i, 1); saveBM(); renderBookmarks(); toast('Bookmark removed');
      }
    });
    a.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      editBookmarkModal(b, updated => { bookmarks[i] = updated; saveBM(); renderBookmarks(); });
    });

    grid.appendChild(a);
  });

  // + Add tile
  const add = document.createElement('button');
  add.className = 'bm bm-add';
  add.textContent = '+ Add';
  add.setAttribute('aria-label', 'Add bookmark');
  add.addEventListener('click', () => {
    editBookmarkModal(null, created => { bookmarks.push(created); saveBM(); renderBookmarks(); toast('Bookmark added'); });
  });
  grid.appendChild(add);
}
renderBookmarks();

// ══════════════════════════════════════════════════════
//  Keyboard shortcuts + ? overlay
// ══════════════════════════════════════════════════════
let shortcutsActive = false;

function showShortcutOverlay() {
  shortcutsActive = true;
  document.body.classList.add('shortcuts-active');
  $('#shortcutOverlay').classList.remove('hidden');
}

function hideShortcutOverlay() {
  shortcutsActive = false;
  document.body.classList.remove('shortcuts-active');
  $('#shortcutOverlay').classList.add('hidden');
}

document.addEventListener('keydown', e => {
  // Modal open — only handle Escape
  if (!$('#modal').classList.contains('hidden')) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  // Ignore when typing in inputs
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key;

  // ? toggles overlay
  if (key === '?') { shortcutsActive ? hideShortcutOverlay() : showShortcutOverlay(); return; }

  // Escape closes overlay
  if (key === 'Escape' && shortcutsActive) { hideShortcutOverlay(); return; }

  // Single-letter bookmark shortcut
  if (key.length === 1) {
    const bm = bookmarks.find(b => b.shortcut && b.shortcut.toLowerCase() === key.toLowerCase());
    if (bm) {
      if (shortcutsActive) hideShortcutOverlay();
      window.location.href = bm.url;
    }
  }
});

// ══════════════════════════════════════════════════════
//  To-Do
// ══════════════════════════════════════════════════════
function getTodos() { try { return JSON.parse(localStorage.getItem(KEYS.todos)) || []; } catch { return []; } }
function saveTodos(t) { localStorage.setItem(KEYS.todos, JSON.stringify(t)); }

function renderTodos() {
  const list = $('#todoList');
  list.innerHTML = '';
  const todos = getTodos();

  if (todos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'All clear! Add a task above.';
    list.appendChild(empty);
    return;
  }

  todos.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'todo-item' + (t.done ? ' completed' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!t.done;
    cb.setAttribute('aria-label', t.done ? 'Mark incomplete' : 'Mark complete');
    cb.addEventListener('change', () => {
      const arr = getTodos(); arr[i].done = cb.checked; saveTodos(arr); renderTodos();
    });

    const txt = document.createElement('div');
    txt.className = 'text'; txt.textContent = t.text;

    const del = document.createElement('button');
    del.className = 'action-btn'; del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete task');
    del.addEventListener('click', () => {
      const arr = getTodos(); arr.splice(i, 1); saveTodos(arr); renderTodos();
    });

    row.append(cb, txt, del);
    list.appendChild(row);
  });

  // Clear completed button
  const doneCount = todos.filter(t => t.done).length;
  if (doneCount > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-ghost btn-sm clear-done';
    clearBtn.textContent = `Clear ${doneCount} completed`;
    clearBtn.addEventListener('click', () => {
      saveTodos(getTodos().filter(t => !t.done));
      renderTodos();
      toast('Completed tasks cleared');
    });
    list.appendChild(clearBtn);
  }
}

$('#todoForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const inp = $('#todoInput');
  const val = inp.value.trim();
  if (!val) return;
  const arr = getTodos();
  arr.unshift({ text: val, done: false });
  saveTodos(arr);
  inp.value = '';
  renderTodos();
});
renderTodos();

// ══════════════════════════════════════════════════════
//  Settings modal
// ══════════════════════════════════════════════════════
function openSettings() {
  openModal('Settings', body => {
    // -- Widgets section --
    const widgetSec = document.createElement('div');
    widgetSec.className = 'settings-section';
    const wh = document.createElement('h3'); wh.textContent = 'Widgets';
    const togglesDiv = document.createElement('div');
    togglesDiv.id = 'widgetToggles';
    WIDGET_DEFS.forEach(w => {
      const row = document.createElement('label');
      row.className = 'toggle-row';
      const span = document.createElement('span');
      span.textContent = `${w.icon} ${w.name}`;
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.dataset.widgetId = w.id; cb.checked = widgetOn(w.id);
      const sw = document.createElement('span');
      sw.className = 'toggle-switch';
      row.append(span, cb, sw);
      togglesDiv.appendChild(row);
    });
    widgetSec.append(wh, togglesDiv);

    // -- Wallpaper section --
    const wpSec = document.createElement('div');
    wpSec.className = 'settings-section';
    const wpH = document.createElement('h3'); wpH.textContent = 'Wallpaper';
    const wpLabel = document.createElement('label');
    wpLabel.className = 'settings-label'; wpLabel.textContent = 'Unsplash Access Key';
    const wpInput = document.createElement('input');
    wpInput.className = 'input'; wpInput.type = 'text'; wpInput.id = 'setUnsplash';
    wpInput.value = localStorage.getItem(KEYS.unsplashKey) || '';
    wpInput.placeholder = 'Paste your client ID';
    wpLabel.appendChild(wpInput);
    wpSec.append(wpH, wpLabel);

    // -- Appearance section --
    const apSec = document.createElement('div');
    apSec.className = 'settings-section';
    const apH = document.createElement('h3'); apH.textContent = 'Appearance';
    const apLabel = document.createElement('label');
    apLabel.className = 'settings-label'; apLabel.textContent = 'Favicon emoji';
    const apInput = document.createElement('input');
    apInput.className = 'input'; apInput.maxLength = 4; apInput.id = 'setFavicon';
    apInput.value = '✈️'; apInput.placeholder = 'e.g. 📑';
    apLabel.appendChild(apInput);
    apSec.append(apH, apLabel);

    // -- Data section --
    const dataSec = document.createElement('div');
    dataSec.className = 'settings-section';
    const dataH = document.createElement('h3'); dataH.textContent = 'Data';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-danger'; resetBtn.textContent = 'Reset bookmarks to defaults';
    resetBtn.addEventListener('click', async () => {
      if (await modalConfirm('Reset Bookmarks', 'Restore default bookmarks? Current ones will be lost.')) {
        bookmarks = [...DEFAULT_BM]; saveBM(); renderBookmarks();
        toast('Bookmarks reset to defaults');
      }
    });
    dataSec.append(dataH, resetBtn);

    // -- Actions --
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost'; cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closeModal;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      // Save widget toggles
      const prefs = widgetPrefs();
      body.querySelectorAll('[data-widget-id]').forEach(cb => {
        prefs[cb.dataset.widgetId] = cb.checked;
      });
      saveWidgetPrefs(prefs);
      applyWidgets();

      // Save Unsplash key
      const uKey = body.querySelector('#setUnsplash').value.trim();
      if (uKey) localStorage.setItem(KEYS.unsplashKey, uKey);
      else localStorage.removeItem(KEYS.unsplashKey);

      // Save favicon
      const fav = body.querySelector('#setFavicon').value.trim();
      if (fav) {
        $('#fav').href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${fav}</text></svg>`;
      }

      closeModal();
      toast('Settings saved', 'success');
    });
    actions.append(cancelBtn, saveBtn);

    body.append(widgetSec, wpSec, apSec, dataSec, actions);
  });
}

$('#settingsBtn').addEventListener('click', openSettings);

// ══════════════════════════════════════════════════════
//  Footer legend (first-run)
// ══════════════════════════════════════════════════════
if (localStorage.getItem(KEYS.legendDismissed)) {
  $('#footerLegend').classList.add('hidden');
} else {
  $('#legendDismiss').addEventListener('click', () => {
    $('#footerLegend').classList.add('hidden');
    localStorage.setItem(KEYS.legendDismissed, '1');
  });
}

// ══════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════
applyWidgets();
initWallpaper();
