import { createStore, defaultProject, sanitizeProject, uid } from './store.js';
import { initUI } from './ui.js';

const KEY = 'bubblotics.pp.projects.v1', UIKEY = 'bubblotics.pp.ui.v1';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const saved = read(KEY);
const data = { current: null, projects: {} };
if (saved?.projects) {
  for (const [id, p] of Object.entries(saved.projects)) {
    try { data.projects[id] = sanitizeProject(p); data.projects[id].id = id; } catch { /* skip corrupt project */ }
  }
  data.current = data.projects[saved.current] ? saved.current : Object.keys(data.projects)[0] || null;
}
if (!data.current) { const p = defaultProject('My first auto'); data.projects[p.id] = p; data.current = p.id; }

const prefs = read(UIKEY) || {};
const store = createStore(data.projects[data.current], {
  overlays: prefs.overlays ? { footprint: true, ticks: true, swept: false, heat: false, bounds: true, obstacles: true, ...prefs.overlays } : undefined,
  imageOpacity: typeof prefs.imageOpacity === 'number' ? prefs.imageOpacity : 1,
});
if (!prefs.overlays) store.get().ui.overlays = { footprint: true, ticks: true, swept: false, heat: false, bounds: true, obstacles: true, zones: true };

/* autosave */
let timer = 0;
const save = () => {
  const st = store.get();
  data.projects[st.project.id] = st.project;
  data.current = st.project.id;
  write(KEY, data);
  write(UIKEY, { overlays: st.ui.overlays, imageOpacity: st.ui.imageOpacity });
};
let lastProj = store.get().project, lastUi = store.get().ui;
store.subscribe((st) => {
  if (st.project !== lastProj || st.ui.overlays !== lastUi.overlays || st.ui.imageOpacity !== lastUi.imageOpacity) {
    lastProj = st.project; lastUi = st.ui;
    clearTimeout(timer); timer = setTimeout(save, 250);
  }
  lastUi = st.ui;
});
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

/* field image in IndexedDB (too big for localStorage) */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('bubblotics-pp', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const kv = async (mode, fn) => {
  try {
    const db = await idb();
    return await new Promise((res, rej) => { const q = fn(db.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  } catch { return null; }
};

const open = (p) => { save(); store.dispatch({ type: 'loadProject', project: p }); save(); };
const api = {
  list: (live) => Object.values({ ...data.projects, [live.id]: live }).sort((a, b) => b.updatedAt - a.updatedAt),
  switchProject: (id) => { if (data.projects[id]) open(data.projects[id]); },
  newProject: () => { const p = defaultProject('New auto'); p.chains = []; data.projects[p.id] = p; open(p); },
  duplicateProject: () => {
    const p = structuredClone(store.get().project); p.id = uid('p_'); p.name += ' copy'; p.updatedAt = Date.now();
    data.projects[p.id] = p; open(p);
  },
  deleteProject: () => {
    delete data.projects[store.get().project.id];
    let next = Object.values(data.projects)[0];
    if (!next) { next = defaultProject('My first auto'); data.projects[next.id] = next; }
    store.dispatch({ type: 'loadProject', project: next }); save();
  },
  importProject: (obj) => { const p = sanitizeProject(obj); p.id = uid('p_'); data.projects[p.id] = p; open(p); },
  image: {
    load: () => kv('readonly', (s) => s.get('fieldImage')),
    save: (url) => kv('readwrite', (s) => s.put(url, 'fieldImage')),
    clear: () => kv('readwrite', (s) => s.delete('fieldImage')),
  },
};

initUI(store, api);
save();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
