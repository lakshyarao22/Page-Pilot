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
  habits:           'bento.habits',
  habitLogs:        'bento.habitlogs',
  countdown:        'bento.countdown',
  greetingName:     'bento.greeting.name',
  widgetOrder:      'bento.widgetorder',
  pomoState:        'bento.pomo.state',
  wallpaperCache:   'bento.wallpaper.cache',
  widgetSizes:      'bento.widgetsizes',
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
  { id: 'clock',       name: 'Clock & Weather', icon: '🕐', on: true },
  { id: 'bookmarks',   name: 'Bookmarks',       icon: '🔖', on: true },
  { id: 'todo',        name: 'To-Do',           icon: '✅', on: true },
  { id: 'greeting',    name: 'Day Greeting',    icon: '👋', on: true },
  { id: 'pomo',        name: 'Pomodoro Timer',  icon: '🍅', on: true },
  { id: 'notes',       name: 'Quick Notes',     icon: '📝', on: true },
  { id: 'habits',      name: 'Habit Tracker',   icon: '🔥', on: true },
  { id: 'worldclocks', name: 'World Clocks',    icon: '🌍', on: true },
  { id: 'countdown',   name: 'Countdown',       icon: '⏳', on: true },
  { id: 'yearprogress',name: 'Year Progress',   icon: '📅', on: true },
];

function widgetPrefs()     { try { return JSON.parse(localStorage.getItem(KEYS.widgets)) || {}; } catch { return {}; } }
function saveWidgetPrefs(p){ localStorage.setItem(KEYS.widgets, JSON.stringify(p)); }
function widgetOn(id)      { const p = widgetPrefs(); return p[id] !== undefined ? p[id] : (WIDGET_DEFS.find(w => w.id === id)?.on ?? true); }

function getWidgetSizes() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.widgetSizes)) || {};
  } catch { return {}; }
}

function saveWidgetSizes(sizes) {
  localStorage.setItem(KEYS.widgetSizes, JSON.stringify(sizes));
}

function getWidgetSize(id) {
  const sizes = getWidgetSizes();
  if (sizes[id]) return sizes[id];
  
  // Default sizes optimized for each widget type (cols x rows)
  const defaultSizes = {
    clock: { cols: 4, rows: 2 },
    greeting: { cols: 3, rows: 1 },
    bookmarks: { cols: 3, rows: 2 },
    todo: { cols: 2, rows: 2 },
    pomo: { cols: 1, rows: 2 },
    notes: { cols: 2, rows: 2 },
    habits: { cols: 3, rows: 2 },
    worldclocks: { cols: 2, rows: 2 },
    countdown: { cols: 3, rows: 2 },
    yearprogress: { cols: 4, rows: 1 }
  };
  
  return defaultSizes[id] || { cols: 2, rows: 1 };
}

function setWidgetSize(id, size) {
  const sizes = getWidgetSizes();
  sizes[id] = size;
  saveWidgetSizes(sizes);
  applyWidgetSizes();
}

function applyWidgetSizes() {
  const sizes = getWidgetSizes();
  document.querySelectorAll('[data-widget]').forEach(widget => {
    const id = widget.dataset.widget;
    const size = getWidgetSize(id);
    
    // Remove all size classes
    widget.classList.remove('widget-small', 'widget-medium', 'widget-large', 'widget-xlarge');
    for (let i = 1; i <= 4; i++) {
      widget.classList.remove(`widget-col-${i}`, `widget-row-${i}`);
    }
    
    // Add current size classes
    widget.classList.add(`widget-col-${size.cols}`, `widget-row-${size.rows}`);
  });
}

function cycleWidgetSize(id) {
  // Cycle through common size combinations: 1×1, 2×1, 2×2, 3×1, 3×2, 4×1, 4×2
  const sizeOptions = [
    { cols: 1, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 3, rows: 1 },
    { cols: 3, rows: 2 },
    { cols: 4, rows: 1 },
    { cols: 4, rows: 2 }
  ];
  
  const current = getWidgetSize(id);
  const currentIndex = sizeOptions.findIndex(s => s.cols === current.cols && s.rows === current.rows);
  const nextIndex = (currentIndex + 1) % sizeOptions.length;
  setWidgetSize(id, sizeOptions[nextIndex]);
}

function applyWidgets() {
  WIDGET_DEFS.forEach(w => {
    const el = $(`[data-widget="${w.id}"]`);
    if (el) el.classList.toggle('widget-hidden', !widgetOn(w.id));
  });
  applyWidgetSizes();
}

// ══════════════════════════════════════════════════════
//  Widget Drag & Drop Reordering
// ══════════════════════════════════════════════════════
function getWidgetOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(KEYS.widgetOrder));
    return order || [];
  } catch { return []; }
}

function saveWidgetOrder(order) {
  localStorage.setItem(KEYS.widgetOrder, JSON.stringify(order));
}

function applyWidgetOrder() {
  const order = getWidgetOrder();
  if (order.length === 0) return;
  
  const grid = $('#widgetGrid');
  const widgets = Array.from(grid.querySelectorAll('[data-widget]'));
  
  // Sort widgets based on saved order
  widgets.sort((a, b) => {
    const aId = a.dataset.widget;
    const bId = b.dataset.widget;
    const aIndex = order.indexOf(aId);
    const bIndex = order.indexOf(bId);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  // Re-append in new order
  widgets.forEach(w => grid.appendChild(w));
}

function initDragDrop() {
  const grid = $('#widgetGrid');
  let draggedElement = null;
  
  // Make all widgets draggable
  grid.querySelectorAll('[data-widget]').forEach(widget => {
    widget.draggable = true;
    
    widget.addEventListener('dragstart', e => {
      draggedElement = widget;
      widget.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    widget.addEventListener('dragend', e => {
      widget.classList.remove('dragging');
      // Save new order
      const newOrder = Array.from(grid.querySelectorAll('[data-widget]')).map(w => w.dataset.widget);
      saveWidgetOrder(newOrder);
    });
    
    widget.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (draggedElement !== widget) {
        // Get all widgets except the dragged one
        const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
        
        if (afterElement == null) {
          grid.appendChild(draggedElement);
        } else {
          grid.insertBefore(draggedElement, afterElement);
        }
      }
    });
  });
  
  // Also handle dragover on the grid itself
  grid.addEventListener('dragover', e => {
    e.preventDefault();
    if (draggedElement) {
      const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
      if (afterElement == null) {
        grid.appendChild(draggedElement);
      } else {
        grid.insertBefore(draggedElement, afterElement);
      }
    }
  });
}

function getDragAfterElement(container, x, y) {
  const draggableElements = [...container.querySelectorAll('[data-widget]:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offsetX = x - box.left - box.width / 2;
    const offsetY = y - box.top - box.height / 2;
    const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    
    // Check if mouse is before this element
    const isBefore = (y < box.top + box.height / 2) || 
                     (y >= box.top && y <= box.bottom && x < box.left + box.width / 2);
    
    if (isBefore && offset < (closest.offset || Infinity)) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, {}).element;
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

function getWallpaperCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(KEYS.wallpaperCache)) || [];
    return cache;
  } catch { return []; }
}

function addToWallpaperCache(url) {
  const cache = getWallpaperCache();
  // Keep only last 20 wallpapers
  if (!cache.includes(url)) {
    cache.unshift(url);
    if (cache.length > 20) cache.pop();
    localStorage.setItem(KEYS.wallpaperCache, JSON.stringify(cache));
  }
}

async function initWallpaper() {
  const apply = (u) => { 
    BG.style.backgroundImage = `url('${u}')`;
    addToWallpaperCache(u);
  };
  
  try {
    const next = localStorage.getItem(KEYS.wallpaperNext);
    const curr = localStorage.getItem(KEYS.wallpaperCurrent);
    const cache = getWallpaperCache();
    
    if (next) {
      try { await preloadImage(next); } catch {}
      apply(next);
      localStorage.setItem(KEYS.wallpaperCurrent, next);
      localStorage.removeItem(KEYS.wallpaperNext);
    } else if (curr) {
      try { await preloadImage(curr); apply(curr); } catch { BG.style.background = '#0b1220'; }
    } else if (cache.length > 0) {
      // Use random cached wallpaper while fetching new one
      const randomCached = cache[Math.floor(Math.random() * cache.length)];
      try { await preloadImage(randomCached); apply(randomCached); } catch {}
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
      addToWallpaperCache(u);
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

    // -- Personalization section --
    const persSec = document.createElement('div');
    persSec.className = 'settings-section';
    const persH = document.createElement('h3'); persH.textContent = 'Personalization';
    const persLabel = document.createElement('label');
    persLabel.className = 'settings-label'; persLabel.textContent = 'Your name (for greeting)';
    const persInput = document.createElement('input');
    persInput.className = 'input'; persInput.id = 'setGreetingName';
    persInput.value = localStorage.getItem(KEYS.greetingName) || '';
    persInput.placeholder = 'e.g. Lakshay';
    persLabel.appendChild(persInput);
    persSec.append(persH, persLabel);

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

      // Save greeting name
      const name = body.querySelector('#setGreetingName').value.trim();
      if (name) localStorage.setItem(KEYS.greetingName, name);
      else localStorage.removeItem(KEYS.greetingName);
      initGreeting();

      closeModal();
      toast('Settings saved', 'success');
    });
    actions.append(cancelBtn, saveBtn);

    body.append(widgetSec, wpSec, apSec, persSec, dataSec, actions);
  });
}

$('#settingsBtn').addEventListener('click', openSettings);

// ══════════════════════════════════════════════════════
//  Day Greeting + Quote
// ══════════════════════════════════════════════════════
const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Do what you can, with what you have, where you are.",
  "Progress, not perfection.",
  "Focus on being productive instead of busy.",
  "Small steps every day.",
  "Make it happen. Shock everyone.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Your limitation—it's only your imagination.",
  "Great things never come from comfort zones.",
  "Dream it. Wish it. Do it.",
];

function initGreeting() {
  const name = localStorage.getItem(KEYS.greetingName) || '';
  const hour = new Date().getHours();
  let greeting = 'Hello';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  
  $('#greetingText').textContent = name ? `${greeting}, ${name} ✨` : `${greeting} ✨`;
  
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('#greetingQuote').textContent = `"${quote}"`;
}

// ══════════════════════════════════════════════════════
//  Pomodoro Timer
// ══════════════════════════════════════════════════════
let pomoState = {
  mode: 'focus',      // 'focus' or 'break'
  timeLeft: 25 * 60,  // seconds
  totalTime: 25 * 60,
  running: false,
  interval: null,
  lastTick: null,     // timestamp of last tick
};

// Request notification permission on first interaction
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: 'icon128.png',
      badge: 'icon128.png',
      tag: 'pomodoro',
    });
  }
}

function savePomoState() {
  const state = {
    mode: pomoState.mode,
    timeLeft: pomoState.timeLeft,
    totalTime: pomoState.totalTime,
    running: pomoState.running,
    lastTick: pomoState.running ? Date.now() : null,
  };
  localStorage.setItem(KEYS.pomoState, JSON.stringify(state));
}

function loadPomoState() {
  try {
    const saved = localStorage.getItem(KEYS.pomoState);
    if (!saved) return;
    
    const state = JSON.parse(saved);
    pomoState.mode = state.mode;
    pomoState.totalTime = state.totalTime;
    pomoState.running = state.running;
    
    // Adjust time if timer was running
    if (state.running && state.lastTick) {
      const elapsed = Math.floor((Date.now() - state.lastTick) / 1000);
      pomoState.timeLeft = Math.max(0, state.timeLeft - elapsed);
      
      // If time ran out while tab was closed
      if (pomoState.timeLeft === 0) {
        pomoTimerComplete();
      } else {
        startPomoInterval();
      }
    } else {
      pomoState.timeLeft = state.timeLeft;
    }
    
    updatePomoDisplay();
    updatePomoButton();
  } catch (e) {
    console.warn('Failed to load pomo state', e);
  }
}

function pomoTimerComplete() {
  clearInterval(pomoState.interval);
  pomoState.running = false;
  
  if (pomoState.mode === 'focus') {
    // Focus session done — log it
    const today = new Date().toISOString().split('T')[0];
    const sessions = JSON.parse(localStorage.getItem(KEYS.pomoSessions) || '{}');
    sessions[today] = (sessions[today] || 0) + 1;
    localStorage.setItem(KEYS.pomoSessions, JSON.stringify(sessions));
    updatePomoSessions();
    
    // Switch to break
    pomoState.mode = 'break';
    pomoState.totalTime = pomoState.timeLeft = 5 * 60;
    $('#pomoMode').textContent = 'Break';
    toast('Focus session complete! Time for a break.', 'success');
    showNotification('🍅 Pomodoro Complete!', 'Great work! Time for a 5-minute break.');
  } else {
    // Break done
    pomoState.mode = 'focus';
    pomoState.totalTime = pomoState.timeLeft = 25 * 60;
    $('#pomoMode').textContent = 'Focus';
    toast('Break over! Ready for another session?');
    showNotification('⏰ Break Over', 'Ready to focus again?');
  }
  
  updatePomoButton();
  updatePomoDisplay();
  savePomoState();
}

function pomoTick() {
  if (pomoState.timeLeft > 0) {
    pomoState.timeLeft--;
    updatePomoDisplay();
    savePomoState();
  } else {
    pomoTimerComplete();
  }
}

function updatePomoDisplay() {
  const min = Math.floor(pomoState.timeLeft / 60);
  const sec = pomoState.timeLeft % 60;
  $('#pomoTime').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  
  // Update progress arc
  const percent = (pomoState.totalTime - pomoState.timeLeft) / pomoState.totalTime;
  const circumference = 2 * Math.PI * 34;
  const offset = circumference * (1 - percent);
  $('#pomoArc').style.strokeDashoffset = offset;
  
  // Update mode
  $('#pomoMode').textContent = pomoState.mode === 'focus' ? 'Focus' : 'Break';
}

function updatePomoButton() {
  $('#pomoToggle').textContent = pomoState.running ? '⏸ Pause' : '▶ Start';
}

function updatePomoSessions() {
  const today = new Date().toISOString().split('T')[0];
  const sessions = JSON.parse(localStorage.getItem(KEYS.pomoSessions) || '{}');
  const count = sessions[today] || 0;
  $('#pomoSessions').textContent = `Sessions today: ${count}`;
}

function startPomoInterval() {
  clearInterval(pomoState.interval);
  pomoState.interval = setInterval(pomoTick, 1000);
}

$('#pomoToggle').addEventListener('click', async () => {
  await requestNotificationPermission();
  
  if (pomoState.running) {
    // Pause
    clearInterval(pomoState.interval);
    pomoState.running = false;
  } else {
    // Start
    pomoState.running = true;
    startPomoInterval();
  }
  
  updatePomoButton();
  savePomoState();
});

$('#pomoReset').addEventListener('click', () => {
  clearInterval(pomoState.interval);
  pomoState.running = false;
  pomoState.mode = 'focus';
  pomoState.totalTime = pomoState.timeLeft = 25 * 60;
  updatePomoDisplay();
  updatePomoButton();
  savePomoState();
});

// Spacebar to start/pause when pomo widget is focused
$('#pomoCard').addEventListener('keydown', async e => {
  if (e.key === ' ' && e.target === $('#pomoCard')) {
    e.preventDefault();
    $('#pomoToggle').click();
  }
});

// Sync state across tabs
window.addEventListener('storage', e => {
  if (e.key === KEYS.pomoState) {
    loadPomoState();
  }
});

// Initialize
loadPomoState();
updatePomoDisplay();
updatePomoSessions();

// ══════════════════════════════════════════════════════
//  Quick Notes
// ══════════════════════════════════════════════════════
const notesArea = $('#notesArea');
let notesSaveTimeout = null;

notesArea.value = localStorage.getItem(KEYS.notes) || '';

notesArea.addEventListener('input', () => {
  $('#notesStatus').textContent = 'Typing...';
  clearTimeout(notesSaveTimeout);
  notesSaveTimeout = setTimeout(() => {
    localStorage.setItem(KEYS.notes, notesArea.value);
    $('#notesStatus').textContent = 'Saved';
  }, 800);
});

// ══════════════════════════════════════════════════════
//  Habit Tracker
// ══════════════════════════════════════════════════════
function getHabits() {
  try { return JSON.parse(localStorage.getItem(KEYS.habits)) || []; }
  catch { return []; }
}

function saveHabits(h) {
  localStorage.setItem(KEYS.habits, JSON.stringify(h));
}

function getHabitLogs() {
  try { return JSON.parse(localStorage.getItem(KEYS.habitLogs)) || {}; }
  catch { return {}; }
}

function saveHabitLogs(logs) {
  localStorage.setItem(KEYS.habitLogs, JSON.stringify(logs));
}

function renderHabits() {
  const list = $('#habitList');
  list.innerHTML = '';
  const habits = getHabits();
  
  if (habits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No habits yet. Click + Add to start.';
    list.appendChild(empty);
    return;
  }
  
  const logs = getHabitLogs();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  habits.forEach((habit, i) => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    
    const header = document.createElement('div');
    header.className = 'habit-header';
    
    const name = document.createElement('div');
    name.className = 'habit-name';
    name.textContent = habit.name;
    
    const trackBtn = document.createElement('button');
    trackBtn.className = 'habit-track-btn';
    const todayKey = `${habit.id}_${todayStr}`;
    const isTracked = logs[todayKey];
    trackBtn.textContent = isTracked ? '✓ Done' : 'Track';
    if (isTracked) trackBtn.classList.add('tracked');
    
    trackBtn.addEventListener('click', () => {
      const newLogs = getHabitLogs();
      if (newLogs[todayKey]) {
        delete newLogs[todayKey];
      } else {
        newLogs[todayKey] = true;
      }
      saveHabitLogs(newLogs);
      renderHabits();
      toast(newLogs[todayKey] ? 'Habit tracked!' : 'Habit untracked');
    });
    
    header.append(name, trackBtn);
    
    const grid = document.createElement('div');
    grid.className = 'habit-grid';
    
    // Show last 30 days (reversed - today on left)
    for (let d = 0; d <= 29; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      
      const dot = document.createElement('button');
      dot.className = 'habit-dot';
      dot.setAttribute('aria-label', dateStr);
      
      const key = `${habit.id}_${dateStr}`;
      if (logs[key]) dot.classList.add('done');
      
      // Only allow toggling today and past 7 days
      if (d <= 7) {
        dot.addEventListener('click', () => {
          const newLogs = getHabitLogs();
          if (newLogs[key]) delete newLogs[key];
          else newLogs[key] = true;
          saveHabitLogs(newLogs);
          renderHabits();
        });
      } else {
        dot.disabled = true;
      }
      
      grid.appendChild(dot);
    }
    
    const del = document.createElement('button');
    del.className = 'action-btn habit-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete habit');
    del.addEventListener('click', () => {
      const arr = getHabits();
      arr.splice(i, 1);
      saveHabits(arr);
      renderHabits();
    });
    
    row.append(header, grid, del);
    list.appendChild(row);
  });
}

$('#addHabitBtn').addEventListener('click', () => {
  openModal('Add Habit', body => {
    const form = document.createElement('form');
    const lbl = document.createElement('label');
    lbl.textContent = 'Habit name';
    lbl.style.fontSize = '13px';
    lbl.style.color = 'var(--muted)';
    lbl.style.marginBottom = '4px';
    lbl.style.display = 'block';
    const inp = document.createElement('input');
    inp.className = 'input';
    inp.placeholder = 'e.g. Meditate, Exercise, Read';
    inp.required = true;
    lbl.appendChild(inp);
    form.appendChild(lbl);
    
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost';
    cancel.textContent = 'Cancel';
    cancel.onclick = closeModal;
    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'btn btn-primary';
    add.textContent = 'Add';
    actions.append(cancel, add);
    form.appendChild(actions);
    
    form.addEventListener('submit', e => {
      e.preventDefault();
      const habits = getHabits();
      habits.push({
        id: Date.now().toString(),
        name: inp.value.trim(),
      });
      saveHabits(habits);
      renderHabits();
      closeModal();
      toast('Habit added');
    });
    
    body.appendChild(form);
  });
});

renderHabits();

// ══════════════════════════════════════════════════════
//  World Clocks
// ══════════════════════════════════════════════════════
function getWorldClocks() {
  try { return JSON.parse(localStorage.getItem(KEYS.worldclocks)) || []; }
  catch { return []; }
}

function saveWorldClocks(c) {
  localStorage.setItem(KEYS.worldclocks, JSON.stringify(c));
}

function renderWorldClocks() {
  const list = $('#worldClockList');
  list.innerHTML = '';
  const clocks = getWorldClocks();
  
  if (clocks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No clocks yet. Click + Add.';
    list.appendChild(empty);
    return;
  }
  
  clocks.forEach((clock, i) => {
    const row = document.createElement('div');
    row.className = 'clock-row';
    
    const label = document.createElement('div');
    label.className = 'clock-label';
    label.textContent = clock.label;
    
    const time = document.createElement('div');
    time.className = 'clock-time';
    time.dataset.tz = clock.tz;
    
    const del = document.createElement('button');
    del.className = 'action-btn';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete clock');
    del.addEventListener('click', () => {
      const arr = getWorldClocks();
      arr.splice(i, 1);
      saveWorldClocks(arr);
      renderWorldClocks();
    });
    
    row.append(label, time, del);
    list.appendChild(row);
  });
  
  updateWorldClockTimes();
}

function updateWorldClockTimes() {
  document.querySelectorAll('.clock-time').forEach(el => {
    const tz = el.dataset.tz;
    try {
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
      });
      el.textContent = time;
    } catch {
      el.textContent = '--:--';
    }
  });
}

$('#addClockBtn').addEventListener('click', () => {
  openModal('Add World Clock', body => {
    const form = document.createElement('form');
    
    const lbl1 = document.createElement('label');
    lbl1.textContent = 'Label';
    lbl1.style.fontSize = '13px';
    lbl1.style.color = 'var(--muted)';
    lbl1.style.marginBottom = '4px';
    lbl1.style.display = 'block';
    const inp1 = document.createElement('input');
    inp1.className = 'input';
    inp1.placeholder = 'e.g. New York, Tokyo';
    inp1.required = true;
    lbl1.appendChild(inp1);
    
    const lbl2 = document.createElement('label');
    lbl2.textContent = 'Timezone';
    lbl2.style.fontSize = '13px';
    lbl2.style.color = 'var(--muted)';
    lbl2.style.marginBottom = '4px';
    lbl2.style.marginTop = '12px';
    lbl2.style.display = 'block';
    const inp2 = document.createElement('input');
    inp2.className = 'input';
    inp2.placeholder = 'e.g. America/New_York, Asia/Tokyo';
    inp2.required = true;
    lbl2.appendChild(inp2);
    
    const hint = document.createElement('div');
    hint.style.fontSize = '11px';
    hint.style.color = 'var(--muted)';
    hint.style.marginTop = '6px';
    hint.innerHTML = 'See <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank" style="color:var(--accent)">timezone list</a>';
    
    form.append(lbl1, lbl2, hint);
    
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost';
    cancel.textContent = 'Cancel';
    cancel.onclick = closeModal;
    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'btn btn-primary';
    add.textContent = 'Add';
    actions.append(cancel, add);
    form.appendChild(actions);
    
    form.addEventListener('submit', e => {
      e.preventDefault();
      const clocks = getWorldClocks();
      clocks.push({
        label: inp1.value.trim(),
        tz: inp2.value.trim(),
      });
      saveWorldClocks(clocks);
      renderWorldClocks();
      closeModal();
      toast('Clock added');
    });
    
    body.appendChild(form);
  });
});

renderWorldClocks();
setInterval(updateWorldClockTimes, 30000); // Update every 30s

// ══════════════════════════════════════════════════════
//  Countdown
// ══════════════════════════════════════════════════════
function getCountdowns() {
  try {
    const c = JSON.parse(localStorage.getItem(KEYS.countdown));
    // Migrate old single countdown to array
    if (c && !Array.isArray(c)) {
      return [c];
    }
    return c || [];
  } catch { return []; }
}

function saveCountdowns(c) {
  localStorage.setItem(KEYS.countdown, JSON.stringify(c));
}

function renderCountdown() {
  const display = $('#countdownDisplay');
  const countdowns = getCountdowns();
  
  if (countdowns.length === 0) {
    display.innerHTML = '<div class="empty-state">Click + Add to create a countdown</div>';
    return;
  }
  
  display.innerHTML = '';
  
  countdowns.forEach((cd, index) => {
    const item = document.createElement('div');
    item.className = 'countdown-item';
    
    const target = new Date(cd.date);
    const now = new Date();
    const diff = target - now;
    
    let content;
    if (diff <= 0) {
      content = `
        <div class="countdown-main">${cd.name}</div>
        <div class="countdown-sub">The day is here! 🎉</div>
      `;
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      content = `
        <div class="countdown-main">${cd.name}</div>
        <div class="countdown-time">${days}<span class="countdown-unit">d</span> ${hours}<span class="countdown-unit">h</span></div>
        <div class="countdown-sub">${target.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      `;
    }
    
    item.innerHTML = content;
    
    // Add delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn countdown-delete';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete countdown');
    delBtn.addEventListener('click', () => {
      const arr = getCountdowns();
      arr.splice(index, 1);
      saveCountdowns(arr);
      renderCountdown();
      toast('Countdown removed');
    });
    item.appendChild(delBtn);
    
    display.appendChild(item);
  });
}

$('#editCountdownBtn').addEventListener('click', () => {
  openModal('Add Countdown', body => {
    const form = document.createElement('form');
    
    const lbl1 = document.createElement('label');
    lbl1.textContent = 'Event name';
    lbl1.style.fontSize = '13px';
    lbl1.style.color = 'var(--muted)';
    lbl1.style.marginBottom = '4px';
    lbl1.style.display = 'block';
    const inp1 = document.createElement('input');
    inp1.className = 'input';
    inp1.placeholder = 'e.g. Vacation, Deadline, Birthday';
    inp1.required = true;
    lbl1.appendChild(inp1);
    
    const lbl2 = document.createElement('label');
    lbl2.textContent = 'Target date';
    lbl2.style.fontSize = '13px';
    lbl2.style.color = 'var(--muted)';
    lbl2.style.marginBottom = '4px';
    lbl2.style.marginTop = '12px';
    lbl2.style.display = 'block';
    const inp2 = document.createElement('input');
    inp2.className = 'input';
    inp2.type = 'date';
    inp2.required = true;
    lbl2.appendChild(inp2);
    
    form.append(lbl1, lbl2);
    
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost';
    cancel.textContent = 'Cancel';
    cancel.onclick = closeModal;
    
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary';
    save.textContent = 'Add';
    
    actions.append(cancel, save);
    form.appendChild(actions);
    
    form.addEventListener('submit', e => {
      e.preventDefault();
      const countdowns = getCountdowns();
      countdowns.push({
        id: Date.now().toString(),
        name: inp1.value.trim(),
        date: new Date(inp2.value).toISOString(),
      });
      saveCountdowns(countdowns);
      renderCountdown();
      closeModal();
      toast('Countdown added');
    });
    
    body.appendChild(form);
  });
});

renderCountdown();
setInterval(renderCountdown, 60000); // Update every minute

// ══════════════════════════════════════════════════════
//  Year Progress
// ══════════════════════════════════════════════════════
function renderYearProgress() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);
  
  const daysInYear = Math.ceil((endOfYear - startOfYear) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.ceil((now - startOfYear) / (1000 * 60 * 60 * 24));
  const daysLeft = daysInYear - daysPassed;
  const percentComplete = Math.round((daysPassed / daysInYear) * 100);
  
  // Update stats
  $('#yearDaysPassed').textContent = daysPassed;
  $('#yearPercent').textContent = percentComplete + '%';
  $('#yearDaysLeft').textContent = daysLeft;
  
  // Render grid
  const grid = $('#yearProgressGrid');
  grid.innerHTML = '';
  
  for (let i = 1; i <= daysInYear; i++) {
    const dot = document.createElement('div');
    dot.className = 'year-dot';
    
    if (i < daysPassed) {
      dot.classList.add('passed');
    } else if (i === daysPassed) {
      dot.classList.add('today');
      dot.title = `Today - Day ${i} of ${daysInYear}`;
    } else {
      dot.title = `Day ${i} of ${daysInYear}`;
    }
    
    grid.appendChild(dot);
  }
}

renderYearProgress();
// Update at midnight
const updateAtMidnight = () => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = tomorrow - now;
  setTimeout(() => {
    renderYearProgress();
    updateAtMidnight();
  }, msUntilMidnight);
};
updateAtMidnight();

initGreeting();

// ══════════════════════════════════════════════════════
//  Widget Resize Buttons
// ══════════════════════════════════════════════════════
function initResizeButtons() {
  document.querySelectorAll('[data-widget]').forEach(widget => {
    const id = widget.dataset.widget;
    
    // Skip if button already exists
    if (widget.querySelector('.widget-resize-btn')) return;
    
    const btn = document.createElement('button');
    btn.className = 'widget-resize-btn';
    btn.setAttribute('aria-label', 'Resize widget');
    btn.title = 'Resize widget';
    
    const updateIcon = () => {
      const size = getWidgetSize(id);
      // Display current size as "cols×rows"
      btn.textContent = `${size.cols}×${size.rows}`;
      btn.title = `Resize: ${size.cols} columns × ${size.rows} rows`;
    };
    
    updateIcon();
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleWidgetSize(id);
      updateIcon();
    });
    
    widget.appendChild(btn);
  });
}

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
applyWidgetOrder();
initDragDrop();
initResizeButtons();
initWallpaper();
