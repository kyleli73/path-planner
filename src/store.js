import { startsOf, tailPose } from './heading.js';

export const FIELD = 144;
export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const r2 = (n) => Math.round(n * 100) / 100;
const clone = (o) => structuredClone(o);
const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export const defaultRobot = () => ({ w: 18, l: 18, maxVel: 50, maxAccel: 40, maxLatAccel: 30 });
export const defaultOverlays = () => ({ footprint: true, ticks: true, swept: false, heat: false, bounds: true, obstacles: true });

export function defaultProject(name = 'New auto') {
  const p = {
    id: uid('p_'), name, updatedAt: Date.now(), robot: defaultRobot(),
    startPose: { x: 56, y: 9, h: 90 },
    chains: [{
      id: uid('c_'), name: 'path1',
      segments: [
        { id: uid('s_'), kind: 'line', controls: [], end: { x: 56, y: 36, h: 180 }, heading: { mode: 'linear' }, name: '' },
        { id: uid('s_'), kind: 'curve', controls: [{ x: 30, y: 60 }], end: { x: 20, y: 84, h: 180 }, heading: { mode: 'tangential' }, name: '' },
      ],
    }],
    obstacles: [],
  };
  return sync(p);
}

// Coerce untrusted/legacy JSON into a valid project.
export function sanitizeProject(o) {
  if (!o || !Array.isArray(o.chains)) throw new Error('Not a Bubblotics project');
  const d = defaultRobot();
  const pose = (q) => ({ x: num(q?.x, 0), y: num(q?.y, 0), h: num(q?.h, 0) });
  const p = {
    id: typeof o.id === 'string' ? o.id : uid('p_'),
    name: String(o.name || 'Imported auto'),
    updatedAt: num(o.updatedAt, Date.now()),
    robot: Object.fromEntries(Object.keys(d).map((k) => [k, num(o.robot?.[k], d[k]) > 0 ? num(o.robot?.[k], d[k]) : d[k]])),
    startPose: pose(o.startPose),
    chains: o.chains.map((c, i) => ({
      id: c.id || uid('c_'), name: String(c.name ?? `path${i + 1}`),
      segments: (c.segments || []).map((s) => {
        const controls = (s.controls || []).map((q) => ({ x: num(q.x, 0), y: num(q.y, 0) }));
        const mode = ['linear', 'constant', 'tangential'].includes(s.heading?.mode) ? s.heading.mode : 'linear';
        return {
          id: s.id || uid('s_'), kind: controls.length ? 'curve' : 'line', controls, end: pose(s.end),
          heading: mode === 'tangential' && s.heading.reverse ? { mode, reverse: true } : { mode },
          name: String(s.name || ''),
        };
      }),
    })),
    obstacles: (o.obstacles || []).map((r) => ({ x: num(r.x, 0), y: num(r.y, 0), w: Math.max(0, num(r.w, 0)), h: Math.max(0, num(r.h, 0)) })),
  };
  return sync(p);
}

// Keep the stored start pose on each chain's first segment equal to the implied one.
function sync(p) {
  const starts = startsOf(p);
  p.chains.forEach((ch, c) => {
    ch.segments.forEach((s, i) => {
      s.kind = s.controls.length ? 'curve' : 'line';
      if (i === 0) s.start = { ...starts[c][0] }; else delete s.start;
    });
  });
  return p;
}

function validSel(p, sel) {
  const seg = (c, s) => p.chains[c]?.segments[s];
  if (sel.kind === 'segment') return !!seg(sel.chain, sel.seg);
  if (sel.kind === 'point') {
    const s = seg(sel.chain, sel.seg);
    return !!s && (sel.which === 'end' || !!s.controls[sel.index]);
  }
  if (sel.kind === 'obstacle') return !!p.obstacles[sel.index];
  return true;
}
const NONE = { kind: 'none' };
const fixSel = (s) => (validSel(s.project, s.selection) ? s : { ...s, selection: NONE });

function edit(s, fn) {
  const p = clone(s.project);
  fn(p);
  sync(p);
  p.updatedAt = Date.now();
  return fixSel({ ...s, project: p });
}
const move = (arr, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  arr.splice(to, 0, arr.splice(from, 1)[0]);
};
const clamp = (v) => Math.min(FIELD, Math.max(0, v));
const posRef = (p, a) => {
  const seg = p.chains[a.chain]?.segments[a.seg];
  if (!seg) return null;
  return a.which === 'end' ? seg.end : seg.controls[a.index];
};
const applyHeading = (seg, mode, reverse) => {
  seg.heading = mode === 'tangential' && reverse ? { mode, reverse: true } : { mode };
};

const H = {
  select: (s, a) => ({ ...s, selection: a.selection }),
  setUi: (s, a) => ({ ...s, ui: { ...s.ui, ...a.patch } }),
  renameProject: (s, a) => edit(s, (p) => { p.name = a.name; }),
  setRobot: (s, a) => edit(s, (p) => {
    for (const [k, v] of Object.entries(a.patch)) if (k in p.robot && Number.isFinite(v) && v > 0) p.robot[k] = v;
  }),
  setStartPose: (s, a) => edit(s, (p) => { Object.assign(p.startPose, a.patch); }),
  addChain: (s) => {
    const n = edit(s, (p) => { p.chains.push({ id: uid('c_'), name: `path${p.chains.length + 1}`, segments: [] }); });
    return { ...n, selection: NONE };
  },
  renameChain: (s, a) => edit(s, (p) => { p.chains[a.chain].name = a.name; }),
  deleteChain: (s, a) => edit(s, (p) => { p.chains.splice(a.chain, 1); }),
  moveChain: (s, a) => edit(s, (p) => move(p.chains, a.from, a.to)),
  addSegment: (s, a) => {
    const n = edit(s, (p) => {
      const ch = p.chains[a.chain];
      if (!ch) return;
      const st = ch.segments.length ? ch.segments[ch.segments.length - 1].end : tailPose(p, a.chain - 1);
      const r = (st.h * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      const end = { x: r2(clamp(st.x + 24 * c)), y: r2(clamp(st.y + 24 * sn)), h: st.h };
      const curve = a.kind === 'curve';
      const mid = { x: (st.x + end.x) / 2, y: (st.y + end.y) / 2 };
      ch.segments.push({
        id: uid('s_'), kind: a.kind, name: '', end,
        controls: curve ? [{ x: r2(mid.x - 8 * sn), y: r2(mid.y + 8 * c) }] : [],
        heading: { mode: curve ? 'tangential' : 'linear' },
      });
    });
    const len = n.project.chains[a.chain]?.segments.length || 0;
    return len ? { ...n, selection: { kind: 'segment', chain: a.chain, seg: len - 1 } } : n;
  },
  deleteSegment: (s, a) => edit(s, (p) => { p.chains[a.chain].segments.splice(a.seg, 1); }),
  moveSegment: (s, a) => edit(s, (p) => move(p.chains[a.chain].segments, a.from, a.to)),
  renameSegment: (s, a) => edit(s, (p) => { p.chains[a.chain].segments[a.seg].name = a.name; }),
  setSegmentKind: (s, a) => edit(s, (p) => {
    const seg = p.chains[a.chain].segments[a.seg];
    if (a.kind === 'line') seg.controls = [];
    else if (!seg.controls.length) {
      const st = startsOf(p)[a.chain][a.seg];
      seg.controls = [{ x: r2((st.x + seg.end.x) / 2), y: r2((st.y + seg.end.y) / 2) }];
    }
  }),
  addControl: (s, a) => {
    let idx = 0;
    const n = edit(s, (p) => {
      const seg = p.chains[a.chain].segments[a.seg];
      const st = startsOf(p)[a.chain][a.seg];
      idx = a.index ?? seg.controls.length;
      const prev = idx === 0 ? st : seg.controls[idx - 1];
      const next = idx >= seg.controls.length ? seg.end : seg.controls[idx];
      const pt = a.x !== undefined ? { x: r2(a.x), y: r2(a.y) } : { x: r2((prev.x + next.x) / 2), y: r2((prev.y + next.y) / 2) };
      seg.controls.splice(idx, 0, pt);
    });
    return { ...n, selection: { kind: 'point', chain: a.chain, seg: a.seg, which: 'control', index: idx } };
  },
  removeControl: (s, a) => edit(s, (p) => { p.chains[a.chain].segments[a.seg].controls.splice(a.index, 1); }),
  movePoint: (s, a) => edit(s, (p) => {
    const t = posRef(p, a);
    if (t) { t.x = r2(a.x); t.y = r2(a.y); }
  }),
  setPoint: (s, a) => edit(s, (p) => {
    const t = posRef(p, a);
    if (t) for (const k of ['x', 'y', 'h']) if (a[k] !== undefined && (k !== 'h' || a.which === 'end')) t[k] = a[k];
  }),
  nudge: (s, a) => {
    const sel = s.selection;
    if (sel.kind === 'point') {
      return edit(s, (p) => {
        const t = posRef(p, sel);
        t.x = r2(t.x + a.dx); t.y = r2(t.y + a.dy);
      });
    }
    if (sel.kind === 'obstacle') {
      return edit(s, (p) => { const o = p.obstacles[sel.index]; o.x = r2(o.x + a.dx); o.y = r2(o.y + a.dy); });
    }
    return s;
  },
  setHeadingMode: (s, a) => edit(s, (p) => applyHeading(p.chains[a.chain].segments[a.seg], a.mode, a.reverse)),
  setSegmentEndHeading: (s, a) => edit(s, (p) => { p.chains[a.chain].segments[a.seg].end.h = a.h; }),
  addObstacle: (s, a) => {
    const n = edit(s, (p) => { p.obstacles.push({ x: r2(a.x), y: r2(a.y), w: r2(a.w), h: r2(a.h) }); });
    return { ...n, selection: { kind: 'obstacle', index: n.project.obstacles.length - 1 } };
  },
  updateObstacle: (s, a) => edit(s, (p) => {
    const o = p.obstacles[a.index];
    if (!o) return;
    for (const k of ['x', 'y', 'w', 'h']) if (a.patch[k] !== undefined && Number.isFinite(a.patch[k])) o[k] = k === 'w' || k === 'h' ? Math.max(0, a.patch[k]) : a.patch[k];
  }),
  deleteObstacle: (s, a) => edit(s, (p) => { p.obstacles.splice(a.index, 1); }),
  // Alliance mirror: x -> 144 - x, heading -> 180 - h (no wrapping, so it is an involution).
  mirror: (s) => edit(s, (p) => {
    const mx = (o) => { o.x = FIELD - o.x; };
    mx(p.startPose); p.startPose.h = 180 - p.startPose.h;
    p.chains.forEach((ch) => ch.segments.forEach((sg) => {
      sg.controls.forEach(mx); mx(sg.end); sg.end.h = 180 - sg.end.h;
    }));
    p.obstacles.forEach((o) => { o.x = FIELD - o.x - o.w; });
  }),
};

export function reduce(state, action) {
  const h = H[action.type];
  if (!h) throw new Error('Unknown action ' + action.type);
  return h(state, action);
}

export function initialState(project, uiPrefs = {}) {
  return {
    project, selection: NONE,
    ui: { playhead: 0, playing: false, overlays: defaultOverlays(), tool: 'select', imageOpacity: 0.5, hasImage: false, view: null, cursor: null, draft: null, ...uiPrefs },
  };
}

const NO_HISTORY = new Set(['select', 'setUi']);

// Snapshot-stack undo/redo around the pure reducer.
export function createStore(project, uiPrefs) {
  let state = initialState(project, uiPrefs);
  let past = [], future = [], lastKey = null;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(state));
  const api = {
    get: () => state,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    dispatch(action) {
      if (action.type === 'loadProject') {
        state = { ...state, project: action.project, selection: NONE, ui: { ...state.ui, playhead: 0, playing: false, draft: null } };
        past = []; future = []; lastKey = null;
        return emit();
      }
      const next = reduce(state, action);
      if (next === state) return;
      if (next.project !== state.project && !NO_HISTORY.has(action.type)) {
        if (!(action.coalesce && action.coalesce === lastKey)) {
          past.push(state.project);
          if (past.length > 300) past.shift();
        }
        future = [];
        lastKey = action.coalesce || null;
      }
      state = next;
      emit();
    },
    endCoalesce() { lastKey = null; },
    undo() {
      if (!past.length) return;
      future.push(state.project);
      state = fixSel({ ...state, project: past.pop() });
      lastKey = null; emit();
    },
    redo() {
      if (!future.length) return;
      past.push(state.project);
      state = fixSel({ ...state, project: future.pop() });
      lastKey = null; emit();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
  return api;
}
