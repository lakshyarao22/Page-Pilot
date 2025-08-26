/* Bento rebuilt script.js
 - double-buffer wallpaper (CURRENT / NEXT)
 - Unsplash key stored in localStorage 'bento.unsplash.key' (set via settings)
 - editable emoji bookmarks with shortcuts
 - keyboard shortcuts (disabled when todo input focused)
 - clock + weather merged top
 - bookmarks left, todo right layout
*/

const BG = document.getElementById('bg');
const WALLPAPER_CURRENT = 'bento.wallpaper.current';
const WALLPAPER_NEXT = 'bento.wallpaper.next';
const UNSPLASH_KEY_STORAGE = 'bento.unsplash.key';

// Utility: preload an image and return resolved URL on success
function preloadImage(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}

// Fetch random wallpaper from Unsplash (requires key), fallback to picsum
async function fetchFromUnsplash(topic='landscape'){
  const key = localStorage.getItem(UNSPLASH_KEY_STORAGE) || '';
  if(!key || key==='YOUR_UNSPLASH_KEY') throw new Error('no-key');
  const api = `https://api.unsplash.com/photos/random?orientation=landscape&query=${encodeURIComponent(topic)}&content_filter=high&client_id=${key}`;
  const res = await fetch(api);
  if(!res.ok) throw new Error('unsplash-http-' + res.status);
  const data = await res.json();
  // prefer regular or full; return the URL string
  return data?.urls?.regular || data?.urls?.full || null;
}

async function fetchWallpaper(topic='landscape'){
  // try Unsplash, fallback to picsum
  try{
    const url = await fetchFromUnsplash(topic);
    if(url) return url;
  }catch(e){
    console.warn('Unsplash fetch failed:', e);
  }
  // fallback to picsum (stable)
  return `https://picsum.photos/1920/1080?random=${Date.now()}`;
}

// double-buffering: use NEXT if available, then preload new NEXT
async function setWallpaperDoubleBuffer(){
  try{
    const existingNext = localStorage.getItem(WALLPAPER_NEXT);
    const existingCurrent = localStorage.getItem(WALLPAPER_CURRENT);

    if(existingNext){
      // Use cached next as current
      try { await preloadImage(existingNext); BG.style.backgroundImage = `url('${existingNext}')`; }
      catch(e){ /* ignore preload failure */ BG.style.backgroundImage = `url('${existingNext}')`; }
      // Move next -> current, remove next key
      localStorage.setItem(WALLPAPER_CURRENT, existingNext);
      localStorage.removeItem(WALLPAPER_NEXT);
      // Optionally cleanup previous current (we only stored URLs, so nothing to revoke)
    } else if(existingCurrent){
      // No next cached but have a current from previous session: use it
      try { await preloadImage(existingCurrent); BG.style.backgroundImage = `url('${existingCurrent}')`; }
      catch(e){ BG.style.background = '#0b1220'; }
    } else {
      // nothing: fetch immediately and set as current
      const url = await fetchWallpaper();
      try { await preloadImage(url); BG.style.backgroundImage = `url('${url}')`; localStorage.setItem(WALLPAPER_CURRENT, url); }
      catch(e){ BG.style.background = '#0b1220'; }
    }
  }catch(err){
    console.error('setWallpaperDoubleBuffer error', err);
    BG.style.background = '#0b1220';
  } finally {
    // in background, fetch & store NEXT for the next tab
    (async ()=>{
      try{
        const nextUrl = await fetchWallpaper();
        // preload before saving to improve instant load next time
        try{ await preloadImage(nextUrl); localStorage.setItem(WALLPAPER_NEXT, nextUrl); }catch(e){ localStorage.setItem(WALLPAPER_NEXT, nextUrl); }
      }catch(e){
        console.warn('failed to fetch next wallpaper', e);
      }
    })();
  }
}

// Clock
function updateClock(){
  const now = new Date();
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  timeEl.textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  dateEl.textContent = now.toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
}
updateClock(); setInterval(updateClock, 1000*30);

// Weather (Open-Meteo with reverse geocode)
const weatherBox = {
  temp: document.getElementById('wTemp'),
  desc: document.getElementById('wDesc'),
  wind: document.getElementById('wWind'),
  day: document.getElementById('wDay'),
  icon: document.getElementById('wIcon'),
  cityLabel: document.getElementById('date') // reuse? (we already display date) - keep minimal
};
const weatherCodeMap = {0:['Clear','☀️'],1:['Mainly clear','🌤️'],2:['Partly cloudy','⛅'],3:['Overcast','☁️'],45:['Fog','🌫️'],48:['Rime fog','🌫️'],51:['Light drizzle','🌦️'],53:['Drizzle','🌦️'],55:['Dense drizzle','🌧️'],61:['Slight rain','🌧️'],63:['Rain','🌧️'],65:['Heavy rain','🌧️'],71:['Slight snow','🌨️'],73:['Snow','🌨️'],75:['Heavy snow','🌨️'],80:['Rain showers','🌧️'],81:['Showers','🌧️'],82:['Heavy showers','⛈️'],95:['Thunderstorm','⛈️']};

async function fetchWeather(lat, lon){
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const r = await fetch(url);
    const j = await r.json();
    const c = j.current_weather;
    if(!c) return;
    document.getElementById('wTemp').textContent = Math.round(c.temperature) + '°';
    const map = weatherCodeMap[c.weathercode] || ['Weather','🌡️'];
    document.getElementById('wDesc').textContent = map[0];
    document.getElementById('wIcon').textContent = map[1];
    document.getElementById('wWind').textContent = Math.round(c.windspeed) + ' km/h';
    document.getElementById('wDay').textContent = c.is_day ? 'Day' : 'Night';
  }catch(e){
    console.warn('weather error', e);
  }
}

function initWeather(){
  if(!('geolocation' in navigator)){ document.getElementById('wDesc').textContent='Geolocation unsupported'; return; }
  navigator.geolocation.getCurrentPosition(pos=>{ fetchWeather(pos.coords.latitude, pos.coords.longitude); }, err=>{ document.getElementById('wDesc').textContent='Location blocked'; }, {timeout:8000});
}
initWeather();

// Bookmarks with emoji and shortcuts
const BM_KEY = 'bento.bookmarks.v3';
let bookmarks = JSON.parse(localStorage.getItem(BM_KEY) || 'null') || [
  { name:'Gmail', url:'https://mail.google.com', emoji:'📧', shortcut:'m' },
  { name:'YouTube', url:'https://www.youtube.com', emoji:'▶️', shortcut:'y' },
  { name:'Reddit', url:'https://www.reddit.com', emoji:'👽', shortcut:'r' },
  { name:'GitHub', url:'https://github.com', emoji:'🐙', shortcut:'g' }
];

function saveBookmarks(){ localStorage.setItem(BM_KEY, JSON.stringify(bookmarks)); }

function promptBookmark(initial){
  const emoji = prompt('Emoji for bookmark:', initial?.emoji ?? '🌐');
  if(emoji === null) return null;
  const name = prompt('Title:', initial?.name ?? '');
  if(name === null) return null;
  const url = prompt('URL (include https://):', initial?.url ?? 'https://');
  if(url === null) return null;
  const shortcut = prompt('Shortcut key (single letter, optional):', initial?.shortcut ?? '');
  if(shortcut === null) return null;
  return { name: name.trim() || initial?.name, url: url.trim() || initial?.url, emoji: emoji.trim() || initial?.emoji, shortcut: (shortcut||'').trim().slice(0,1).toLowerCase() };
}

function renderBookmarks(){
  const grid = document.getElementById('bmGrid');
  grid.innerHTML = '';
  bookmarks.forEach((b, idx)=>{
    const a = document.createElement('a');
    a.className = 'bm';
    a.href = b.url;
    a.target = '_self';
    a.innerHTML = `<div class="emoji">${b.emoji}</div><div class="label">${b.name}</div>`;

    // actions container
    const actions = document.createElement('div'); actions.className = 'actions';
    const edit = document.createElement('button'); edit.className='action-btn'; edit.title='Edit'; edit.textContent='✏️';
    const del = document.createElement('button'); del.className='action-btn'; del.title='Delete'; del.textContent='❌';
    actions.appendChild(edit); actions.appendChild(del);
    a.appendChild(actions);

    edit.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); const updated = promptBookmark(b); if(updated){ bookmarks[idx]=updated; saveBookmarks(); renderBookmarks(); } });
    del.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); if(confirm('Delete bookmark?')){ bookmarks.splice(idx,1); saveBookmarks(); renderBookmarks(); } });

    // contextmenu edit
    a.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); const updated = promptBookmark(b); if(updated){ bookmarks[idx]=updated; saveBookmarks(); renderBookmarks(); } });

    grid.appendChild(a);
  });

  // add button
  const add = document.createElement('a'); add.className='bm'; add.href='#'; add.style.justifyContent='center'; add.style.fontWeight='800'; add.textContent='+ Add';
  add.addEventListener('click', (e)=>{ e.preventDefault(); const created = promptBookmark({}); if(created){ bookmarks.push(created); saveBookmarks(); renderBookmarks(); } });
  const clear = document.createElement('a'); clear.className='bm'; clear.href='#'; clear.style.justifyContent='center'; clear.textContent='🗑️ Clear All';
  clear.addEventListener('click', (e)=>{ e.preventDefault(); if(confirm('Clear all bookmarks?')){ bookmarks = []; saveBookmarks(); renderBookmarks(); } });

  grid.appendChild(add); grid.appendChild(clear);
}

renderBookmarks();

// Keyboard shortcuts: open bookmark when shortcut pressed; disabled when todo input focused
document.addEventListener('keydown', (e)=>{
  const active = document.activeElement;
  // only disable when todo input is focused (explicit requirement)
  if(active && active.id === 'todoInput') return;
  // ignore if modifiers present
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if(key.length !== 1) return;
  const bm = bookmarks.find(b => b.shortcut && b.shortcut.toLowerCase() === key);
  if(bm){ window.open(bm.url,'_self'); }
});

// To-do list
const TODO_KEY = 'bento.todos.v1';
function getTodos(){ try{ return JSON.parse(localStorage.getItem(TODO_KEY)) || [] }catch(e){ return [] } }
function saveTodos(t){ localStorage.setItem(TODO_KEY, JSON.stringify(t)); }
function renderTodos(){
  const list = document.getElementById('todoList'); list.innerHTML = '';
  const todos = getTodos();
  todos.forEach((t,i)=>{
    const row = document.createElement('div'); row.className='todo-item';
    const cb = document.createElement('input'); cb.type='checkbox';
    cb.checked = !!t.done;
    cb.addEventListener('change', ()=>{ const arr = getTodos(); arr[i].done = cb.checked; saveTodos(arr); renderTodos(); });
    const txt = document.createElement('div'); txt.className='text'; txt.textContent = t.text;
    const del = document.createElement('button'); del.textContent='✕'; del.className='action-btn'; del.addEventListener('click', ()=>{ const arr=getTodos(); arr.splice(i,1); saveTodos(arr); renderTodos(); });
    row.append(cb, txt, del); list.appendChild(row);
  });
}
document.getElementById('todoForm').addEventListener('submit', (ev)=>{
  ev.preventDefault();
  const inp = document.getElementById('todoInput'); const val = inp.value.trim(); if(!val) return;
  const arr = getTodos(); arr.unshift({text:val, done:false}); saveTodos(arr); inp.value=''; renderTodos();
});
renderTodos();

// Settings button (Unsplash key, favicon emoji, reset)
document.getElementById('settingsBtn').addEventListener('click', ()=>{
  const choice = prompt('Settings:\\n1) Set Unsplash Access Key\\n2) Change page favicon emoji\\n3) Reset bookmarks\\nCancel to close','1');
  if(!choice) return;
  if(choice==='1'){
    const v = prompt('Paste your Unsplash Access Key (client id):','');
    if(v){ localStorage.setItem(UNSPLASH_KEY_STORAGE, v.trim()); alert('Saved. Preloading next wallpaper...'); (async ()=>{ try{ const next = await fetchWallpaper(); await preloadImage(next); localStorage.setItem(WALLPAPER_NEXT,next); alert('Next wallpaper cached.'); }catch(e){ alert('Failed to cache wallpaper: '+e); } })(); }
  } else if(choice==='2'){
    const emoji = prompt('Emoji for page favicon (e.g., 📑):','📑');
    if(emoji){
      const link = document.getElementById('fav'); link.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(emoji)}</text></svg>`;
      // fallback: set without encoding if above fails
      try{ link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`; }catch(e){};
    }
  } else if(choice==='3'){
    if(confirm('Reset bookmarks to defaults?')){ localStorage.removeItem(BM_KEY); bookmarks = []; saveBookmarks(); location.reload(); }
  }
});

// Initialize wallpaper double buffer
setWallpaperDoubleBuffer();
