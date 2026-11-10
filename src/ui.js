import { render, hitTest, fitView, s2w, w2s, chainColor, RULER } from './render.js';
import { derived } from './profile.js';
import { generateJava, className } from './codegen.js';
import { arcLength, segmentPoints, closestT } from './bezier.js';
import { startsOf } from './heading.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f2 = (n) => (Math.round(n * 100) / 100).toString();
const HEADINGS = [['linear', 'Linear'], ['constant', 'Constant'], ['tangential', 'Tangential'], ['reversed', 'Reversed tangential']];
const headingKey = (sg) => (sg.heading.mode === 'tangential' && sg.heading.reverse ? 'reversed' : sg.heading.mode);
const SHORTCUTS = [
  ['Ctrl/Cmd + Z', 'Undo'], ['Ctrl/Cmd + Shift + Z, Ctrl + Y', 'Redo'], ['Space', 'Play / pause'],
  ['Arrow keys', 'Nudge selected point 0.5 in (Shift: 0.1 in)'], ['Delete / Backspace', 'Delete selection'],
  ['N / Shift + N', 'Add line / curve to selected chain'], ['C', 'Add control point to selected segment'],
  ['L', 'Toggle line / curve'], ['1 2 3 4', 'Heading: linear, constant, tangential, reversed'],
  ['O', 'Obstacle draw tool'], ['M', 'Mirror to other alliance'], ['F', 'Fit field to view'],
  ['+ / -', 'Zoom'], ['Esc', 'Deselect / leave tool'], ['Double-click path', 'Insert control point'],
  ['Wheel / pinch', 'Zoom'], ['Right-drag, middle-drag, Space-drag', 'Pan'], ['Shift while dragging', 'Snap to whole inches'], ['?', 'This overlay'],
];

export function initUI(store, api) {
  let fieldImage = null;
  let last = {};
  let inspectorSig = '';
  let rtab = 'inspector';
  try { rtab = localStorage.getItem('bubblotics.pp.rtab') || rtab; } catch { /* storage blocked */ }

  const toast = (msg) => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  };
  const dispatch = (a) => store.dispatch(a);
  const ui = (patch) => dispatch({ type: 'setUi', patch });

  /* ---------- canvas ---------- */
  const cv = $('#field'), ctx = cv.getContext('2d');
  let size = { w: 0, h: 0 }, raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function draw() {
    raf = 0;
    if (size.w) render(ctx, store.get(), size, fieldImage);
    tickSpark();
  }
  const fit = () => ui({ view: fitView(size.w, size.h) });
  new ResizeObserver(() => {
    const r = $('#stage').getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1, first = !size.w;
    size = { w: r.width, h: r.height };
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first || !store.get().ui.view) fit(); else schedule();
  }).observe($('#stage'));

  const zoomAt = (sx, sy, factor) => {
    const v = store.get().ui.view; if (!v) return;
    const scale = Math.min(60, Math.max(1.5, v.scale * factor)), k = scale / v.scale;
    ui({ view: { scale, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k } });
  };
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const snap = (e, n) => (e.shiftKey ? Math.round(n) : Math.round(n * 10) / 10);

  const pointers = new Map();
  let drag = null, pinch = null, spaceDown = false;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    pointers.set(e.pointerId, { x: sx, y: sy });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; ui({ draft: null });
      return;
    }
    const st = store.get(), v = st.ui.view;
    if (!v || sx < RULER || sy < RULER) return;
    const wpt = s2w(v, sx, sy);
    if (e.button === 1 || e.button === 2 || spaceDown) { drag = { type: 'pan', sx, sy, v }; return; }
    if (st.ui.tool === 'obstacle') { drag = { type: 'draw', x0: wpt.x, y0: wpt.y }; return; }
    const hit = hitTest(st, sx, sy);
    if (!hit) { drag = { type: 'pan', sx, sy, v, click: true }; return; }
    if (hit.type === 'start') { dispatch({ type: 'select', selection: { kind: 'none' } }); drag = { type: 'start' }; return; }
    dispatch({ type: 'select', selection: hit.sel });
    if (hit.type === 'point') drag = { type: 'point', sel: hit.sel };
    else if (hit.type === 'obstacle') {
      const o = st.project.obstacles[hit.sel.index];
      drag = { type: 'obstacle', index: hit.sel.index, dx: wpt.x - o.x, dy: wpt.y - o.y };
    }
  });

  cv.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: sx, y: sy });
    const st = store.get(), v = st.ui.view;
    if (!v) return;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const cur = store.get().ui.view;
      const scale = Math.min(60, Math.max(1.5, cur.scale * (d / pinch.d))), k = scale / cur.scale;
      ui({ view: { scale, ox: cx - (pinch.cx - cur.ox) * k, oy: cy - (pinch.cy - cur.oy) * k } });
      pinch = { d, cx, cy };
      return;
    }
    const w = s2w(v, sx, sy);
    ui({ cursor: w });
    $('#coords').textContent = `x ${w.x.toFixed(1)}, y ${w.y.toFixed(1)}`;
    if (!drag) return;
    if (drag.type === 'pan') {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.click = false;
      ui({ view: { ...drag.v, ox: drag.v.ox + sx - drag.sx, oy: drag.v.oy + sy - drag.sy } });
    } else if (drag.type === 'point') {
      dispatch({ type: 'movePoint', ...drag.sel, x: snap(e, w.x), y: snap(e, w.y), coalesce: 'drag' });
    } else if (drag.type === 'start') {
      dispatch({ type: 'setStartPose', patch: { x: snap(e, w.x), y: snap(e, w.y) }, coalesce: 'drag' });
    } else if (drag.type === 'obstacle') {
      dispatch({ type: 'updateObstacle', index: drag.index, patch: { x: snap(e, w.x - drag.dx), y: snap(e, w.y - drag.dy) }, coalesce: 'drag' });
    } else if (drag.type === 'draw') {
      ui({ draft: { x: Math.min(drag.x0, w.x), y: Math.min(drag.y0, w.y), w: Math.abs(w.x - drag.x0), h: Math.abs(w.y - drag.y0) } });
    }
  });

  const endDrag = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    if (drag.type === 'draw') {
      const d = store.get().ui.draft;
      ui({ draft: null });
      if (d && d.w >= 2 && d.h >= 2) dispatch({ type: 'addObstacle', x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10, w: Math.round(d.w * 10) / 10, h: Math.round(d.h * 10) / 10 });
    } else if (drag.type === 'pan' && drag.click) dispatch({ type: 'select', selection: { kind: 'none' } });
    store.endCoalesce();
    drag = null;
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { if (!drag) { ui({ cursor: null }); $('#coords').textContent = 'x -, y -'; } });

  cv.addEventListener('dblclick', (e) => {
    const [sx, sy] = local(e), st = store.get();
    const hit = hitTest(st, sx, sy);
    if (!hit || hit.type !== 'segment') return;
    const { chain, seg } = hit.sel, w = s2w(st.ui.view, sx, sy);
    const sg = st.project.chains[chain].segments[seg];
    const pts = segmentPoints(sg, startsOf(st.project)[chain][seg]);
    // control i sits near parameter (i+1)/n; insert so order along the curve is kept
    const n = pts.length - 1, index = Math.min(sg.controls.length, Math.floor(closestT(pts, w).t * n));
    dispatch({ type: 'addControl', chain, seg, index, x: w.x, y: w.y });
  });

  /* ---------- left panel ---------- */
  function renderChains(st) {
    const P = st.project, D = derived(P), sel = st.selection;
    $('#chains').innerHTML = P.chains.map((ch, c) => {
      const chSel = (sel.kind === 'segment' || sel.kind === 'point') && sel.chain === c;
      const segs = ch.segments.map((sg, s) => {
        const on = (sel.kind === 'segment' || sel.kind === 'point') && sel.chain === c && sel.seg === s;
        const t = D.timeline.chains[c].segTimes[s] || 0;
        return `<li class="${on ? 'sel' : ''}" data-c="${c}" data-s="${s}"><span class="nm">${s + 1}. ${esc(sg.name || (sg.kind === 'line' ? 'Line' : `Curve (deg ${sg.controls.length + 1})`))}</span><span class="meta">${t.toFixed(2)}s</span>
          <button class="ib" data-act="seg-up" title="Move up">&uarr;</button><button class="ib" data-act="seg-down" title="Move down">&darr;</button><button class="ib" data-act="seg-ren" title="Rename">&#9998;</button><button class="ib danger" data-act="seg-del" title="Delete">&times;</button></li>`;
      }).join('');
      return `<div class="chain ${chSel ? 'sel' : ''}" data-c="${c}"><div class="row"><span class="swatch" style="background:${chainColor(c)}"></span><span class="nm" data-act="chain-sel">${esc(ch.name)}</span><span class="meta">${D.timeline.chains[c].total.toFixed(2)}s</span>
        <button class="ib" data-act="ch-up" title="Move up">&uarr;</button><button class="ib" data-act="ch-down" title="Move down">&darr;</button><button class="ib" data-act="ch-ren" title="Rename">&#9998;</button><button class="ib danger" data-act="ch-del" title="Delete chain">&times;</button></div>
        <ul>${segs}</ul><div class="row"><button data-act="add-line">+ Line</button><button data-act="add-curve">+ Curve</button></div></div>`;
    }).join('') || '<p class="hint" style="padding:0 6px">No chains yet. Add one.</p>';
  }

  $('#chains').addEventListener('click', (e) => {
    const chEl = e.target.closest('.chain'); if (!chEl) return;
    const c = +chEl.dataset.c, li = e.target.closest('li'), s = li ? +li.dataset.s : -1;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const P = store.get().project;
    if (act === 'ch-up') dispatch({ type: 'moveChain', from: c, to: c - 1 });
    else if (act === 'ch-down') dispatch({ type: 'moveChain', from: c, to: c + 1 });
    else if (act === 'ch-ren') { const n = prompt('Chain name', P.chains[c].name); if (n !== null && n.trim()) dispatch({ type: 'renameChain', chain: c, name: n.trim() }); }
    else if (act === 'ch-del') { if (confirm(`Delete chain "${P.chains[c].name}"? (Undo with Ctrl+Z)`)) dispatch({ type: 'deleteChain', chain: c }); }
    else if (act === 'add-line' || act === 'add-curve') dispatch({ type: 'addSegment', chain: c, kind: act === 'add-line' ? 'line' : 'curve' });
    else if (act === 'seg-up') dispatch({ type: 'moveSegment', chain: c, from: s, to: s - 1 });
    else if (act === 'seg-down') dispatch({ type: 'moveSegment', chain: c, from: s, to: s + 1 });
    else if (act === 'seg-ren') { const n = prompt('Segment name', P.chains[c].segments[s].name || ''); if (n !== null) dispatch({ type: 'renameSegment', chain: c, seg: s, name: n.trim() }); }
    else if (act === 'seg-del') dispatch({ type: 'deleteSegment', chain: c, seg: s });
    else if (li) dispatch({ type: 'select', selection: { kind: 'segment', chain: c, seg: s } });
    else if (act === 'chain-sel' && P.chains[c].segments.length) dispatch({ type: 'select', selection: { kind: 'segment', chain: c, seg: 0 } });
  });
  $('#addChain').onclick = () => dispatch({ type: 'addChain' });

  /* ---------- inspector ---------- */
  const numField = (label, bind, step = 0.5) => `<label>${label}<input type="number" step="${step}" data-bind="${bind}"></label>`;
  function inspectorHTML(st) {
    const P = st.project, sel = st.selection;
    let h = '';
    const sg = (sel.kind === 'point' || sel.kind === 'segment') ? P.chains[sel.chain]?.segments[sel.seg] : null;
    if (sel.kind === 'point' && sg) {
      const end = sel.which === 'end';
      h += `<section><h3>${end ? 'End point' : `Control point ${sel.index + 1}`} &middot; ${esc(P.chains[sel.chain].name)} / ${sel.seg + 1}</h3><div class="grid2">${numField('x (in)', 'pt.x')}${numField('y (in)', 'pt.y')}${end ? numField('heading (deg)', 'pt.h', 1) : ''}</div>
        <p class="hint">Arrow keys nudge 0.5 in, Shift for 0.1 in.</p>${end ? '' : '<div class="row"><button class="danger" data-act="rm-ctl">Remove control point</button></div>'}</section>`;
    }
    if (sel.kind === 'obstacle') {
      h += `<section><h3>Obstacle ${sel.index + 1}</h3><div class="grid2">${numField('x (in)', 'ob.x')}${numField('y (in)', 'ob.y')}${numField('width', 'ob.w')}${numField('height', 'ob.h')}</div>
        <div class="row"><button class="danger" data-act="del-ob">Delete obstacle</button></div></section>`;
    }
    if (sg) {
      h += `<section><h3>Segment ${sel.seg + 1}</h3>
        <label>Name<input type="text" data-bind="seg.name" placeholder="optional"></label>
        <label>Type<select data-seg="kind"><option value="line" ${sg.kind === 'line' ? 'selected' : ''}>Line</option><option value="curve" ${sg.kind === 'curve' ? 'selected' : ''}>Curve (degree ${sg.controls.length + 1})</option></select></label>
        <label>Heading<select data-seg="heading">${HEADINGS.map(([k, n]) => `<option value="${k}" ${headingKey(sg) === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="row"><button data-act="add-ctl">Add control point</button><button class="danger" data-act="del-seg">Delete segment</button></div>
        <div class="hint" id="segstats"></div></section>`;
    }
    h += `<section><h3>Start pose</h3><div class="grid2">${numField('x (in)', 'start.x')}${numField('y (in)', 'start.y')}${numField('heading (deg)', 'start.h', 1)}</div></section>`;
    if (!sg && sel.kind !== 'obstacle') h += '<p class="hint">Click a path, point or obstacle to inspect it. Double-click a path to add a control point.</p>';
    return h;
  }
  function renderInspector(st) {
    const sel = st.selection;
    const sg = (sel.kind === 'point' || sel.kind === 'segment') ? st.project.chains[sel.chain]?.segments[sel.seg] : null;
    const sig = JSON.stringify([sel, sg && [sg.kind, sg.controls.length, headingKey(sg)]]);
    if (sig !== inspectorSig) { inspectorSig = sig; $('#inspector').innerHTML = inspectorHTML(st); }
    const stats = $('#segstats');
    if (stats && sg) {
      const c = $('#inspector'), D = derived(st.project);
      const len = arcLength(segmentPoints(sg, startsOf(st.project)[sel.chain][sel.seg]));
      stats.textContent = `Length ${len.toFixed(2)} in, est. ${(D.timeline.chains[sel.chain].segTimes[sel.seg] || 0).toFixed(2)} s`;
      void c;
    }
  }
  function getBind(st, b) {
    const [g, k] = b.split('.'), P = st.project, sel = st.selection;
    if (g === 'start') return P.startPose[k];
    if (g === 'robot') return P.robot[k];
    if (g === 'ob') return P.obstacles[sel.index]?.[k];
    const sg = P.chains[sel.chain]?.segments[sel.seg];
    if (!sg) return '';
    if (g === 'seg') return sg[k];
    return k === 'h' ? sg.end.h : (sel.which === 'end' ? sg.end : sg.controls[sel.index])?.[k];
  }
  function syncInputs(st) {
    $$('[data-bind]').forEach((el) => {
      if (el === document.activeElement) return;
      const v = getBind(st, el.dataset.bind);
      el.value = typeof v === 'number' ? f2(v) : (v ?? '');
    });
  }
  function applyBind(el) {
    const st = store.get(), sel = st.selection, [g, k] = el.dataset.bind.split('.');
    if (g === 'seg') { if (el.type === 'text') dispatch({ type: 'renameSegment', chain: sel.chain, seg: sel.seg, name: el.value.trim() }); return; }
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) return;
    const co = { coalesce: 'inspect:' + el.dataset.bind };
    if (g === 'start') dispatch({ type: 'setStartPose', patch: { [k]: v }, ...co });
    else if (g === 'robot') dispatch({ type: 'setRobot', patch: { [k]: v }, ...co });
    else if (g === 'ob') dispatch({ type: 'updateObstacle', index: sel.index, patch: { [k]: v }, ...co });
    else if (g === 'pt') dispatch({ type: 'setPoint', chain: sel.chain, seg: sel.seg, which: sel.which, index: sel.index, [k]: v, ...co });
  }
  document.addEventListener('input', (e) => { if (e.target.dataset?.bind && e.target.type === 'number') applyBind(e.target); });
  document.addEventListener('change', (e) => {
    const el = e.target; store.endCoalesce();
    if (el.dataset?.bind && el.type === 'text') applyBind(el);
    if (el.dataset?.seg) {
      const sel = store.get().selection;
      if (el.dataset.seg === 'kind') dispatch({ type: 'setSegmentKind', chain: sel.chain, seg: sel.seg, kind: el.value });
      else setHeading(sel, el.value);
    }
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (el.matches?.('input[type=number][data-bind]') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const step = (e.shiftKey ? 0.1 : 0.5) * (e.key === 'ArrowUp' ? 1 : -1);
      el.value = f2((parseFloat(el.value) || 0) + step);
      applyBind(el);
    }
  });
  function setHeading(sel, key) {
    dispatch({ type: 'setHeadingMode', chain: sel.chain, seg: sel.seg, mode: key === 'reversed' ? 'tangential' : key, reverse: key === 'reversed' });
  }
  $('#inspector').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act, sel = store.get().selection;
    if (act === 'rm-ctl') dispatch({ type: 'removeControl', chain: sel.chain, seg: sel.seg, index: sel.index });
    else if (act === 'add-ctl') dispatch({ type: 'addControl', chain: sel.chain, seg: sel.seg });
    else if (act === 'del-seg') dispatch({ type: 'deleteSegment', chain: sel.chain, seg: sel.seg });
    else if (act === 'del-ob') dispatch({ type: 'deleteObstacle', index: sel.index });
  });

  /* ---------- right tabs ---------- */
  function showRtab(name) {
    rtab = name;
    try { localStorage.setItem('bubblotics.pp.rtab', name); } catch { /* storage blocked */ }
    $$('#rtabs button').forEach((b) => b.classList.toggle('on', b.dataset.rtab === name));
    $$('.rpanel').forEach((p) => p.classList.toggle('on', p.id === name));
  }
  $('#rtabs').addEventListener('click', (e) => { const t = e.target.dataset.rtab; if (t) showRtab(t); });
  showRtab(rtab);
  const showTab = (t) => { document.body.dataset.tab = t; $$('#mtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); setTimeout(() => window.dispatchEvent(new Event('resize')), 0); };
  $('#mtabs').addEventListener('click', (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });
  showTab('field');

  /* ---------- timing / sparkline ---------- */
  const spark = $('#spark'), sctx = spark.getContext('2d');
  function tickSpark() {
    const r = spark.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1, W = r.width, Hh = r.height;
    if (spark.width !== Math.round(W * dpr)) { spark.width = Math.round(W * dpr); spark.height = Math.round(Hh * dpr); }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, W, Hh);
    const st = store.get(), tl = derived(st.project).timeline;
    if (tl.total <= 0) return;
    const vmax = st.project.robot.maxVel;
    const X = (t) => 4 + (t / tl.total) * (W - 8), Y = (v) => Hh - 6 - (v / vmax) * (Hh - 14);
    sctx.strokeStyle = '#14b8a6'; sctx.lineWidth = 1.5; sctx.beginPath();
    let first = true;
    tl.chains.forEach((c) => c.samples.forEach((s) => { const x = X(c.offset + s.time), y = Y(s.v); first ? sctx.moveTo(x, y) : sctx.lineTo(x, y); first = false; }));
    sctx.stroke();
    sctx.strokeStyle = '#334155'; sctx.setLineDash([3, 3]);
    tl.chains.forEach((c) => { if (c.offset) { sctx.beginPath(); sctx.moveTo(X(c.offset), 0); sctx.lineTo(X(c.offset), Hh); sctx.stroke(); } });
    sctx.setLineDash([]); sctx.strokeStyle = '#fff';
    const px = X(Math.min(st.ui.playhead, tl.total)); sctx.beginPath(); sctx.moveTo(px, 0); sctx.lineTo(px, Hh); sctx.stroke();
  }
  function renderTiming(st) {
    const D = derived(st.project), tl = D.timeline;
    $('#totalTime').textContent = `${tl.total.toFixed(2)} s`;
    $('#timeList').innerHTML = st.project.chains.map((ch, c) => `<h3 style="margin-top:10px">${esc(ch.name)}</h3><div class="tl"><b>Chain total</b><b>${tl.chains[c].total.toFixed(2)} s</b></div>` +
      ch.segments.map((s, i) => `<div class="tl"><span>${i + 1}. ${esc(s.name || s.kind)}</span><span>${(tl.chains[c].segTimes[i] || 0).toFixed(2)} s</span></div>`).join('')).join('') +
      (D.oobCount ? `<p class="warn">${D.oobCount} samples put the footprint outside the field.</p>` : '') +
      (D.hitCount ? `<p class="warn">${D.hitCount} samples collide with an obstacle.</p>` : '');
    const sc = $('#scrub'); sc.max = tl.total.toFixed(3);
  }

  /* ---------- code & project io ---------- */
  let codeTimer = 0;
  const refreshCode = () => { $('#javaOut').value = generateJava(store.get().project); };
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const safe = (s) => (String(s).replace(/[^\w.-]+/g, '_') || 'auto');
  $('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#javaOut').value); toast('Copied Java'); }
    catch { $('#javaOut').select(); document.execCommand('copy'); toast('Copied Java'); }
  };
  $('#dlJava').onclick = () => download(className(store.get().project) + '.java', $('#javaOut').value, 'text/x-java-source');
  $('#expJson').onclick = () => download(safe(store.get().project.name) + '.json', JSON.stringify(store.get().project, null, 2), 'application/json');
  $('#impJson').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { api.importProject(JSON.parse(await f.text())); toast('Imported'); } catch (err) { toast('Import failed: ' + err.message); }
  };

  /* ---------- header / project switching ---------- */
  function renderProjects(st) {
    const list = api.list(st.project);
    $('#projSel').innerHTML = list.map((p) => `<option value="${esc(p.id)}" ${p.id === st.project.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    if (document.activeElement !== $('#projName')) $('#projName').value = st.project.name;
  }
  $('#projSel').onchange = (e) => api.switchProject(e.target.value);
  $('#projName').oninput = (e) => dispatch({ type: 'renameProject', name: e.target.value, coalesce: 'rename' });
  $('#projNew').onclick = () => api.newProject();
  $('#projDup').onclick = () => api.duplicateProject();
  $('#projDel').onclick = () => { if (confirm('Delete this project from this browser? This cannot be undone.')) api.deleteProject(); };
  $('#undo').onclick = () => store.undo();
  $('#redo').onclick = () => store.redo();
  $('#mirror').onclick = () => dispatch({ type: 'mirror' });
  $('#fit').onclick = fit;
  $('#help').onclick = () => $('#helpDlg').showModal();
  $('#keys').innerHTML = SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('');

  /* ---------- toolbar, playback, image ---------- */
  $$('[data-tool]').forEach((b) => (b.onclick = () => ui({ tool: b.dataset.tool })));
  $$('[data-ov]').forEach((b) => (b.onclick = () => ui({ overlays: { ...store.get().ui.overlays, [b.dataset.ov]: !store.get().ui.overlays[b.dataset.ov] } })));

  let playRaf = 0, playLast = 0;
  const tickPlay = (now) => {
    const st = store.get(), total = derived(st.project).timeline.total;
    if (!st.ui.playing) { playRaf = 0; return; }
    const next = st.ui.playhead + (now - playLast) / 1000;
    playLast = now;
    if (next >= total) { ui({ playhead: total, playing: false }); playRaf = 0; return; }
    ui({ playhead: next });
    playRaf = requestAnimationFrame(tickPlay);
  };
  const togglePlay = () => {
    const st = store.get(), total = derived(st.project).timeline.total;
    if (st.ui.playing) return ui({ playing: false });
    if (st.ui.playhead >= total) ui({ playhead: 0 });
    ui({ playing: true });
    playLast = performance.now();
    if (!playRaf) playRaf = requestAnimationFrame(tickPlay);
  };
  $('#play').onclick = togglePlay;
  $('#scrub').oninput = (e) => ui({ playhead: parseFloat(e.target.value), playing: false });

  const loadImage = (url) => new Promise((res) => {
    if (!url) { fieldImage = null; return res(); }
    const im = new Image(); im.onload = () => { fieldImage = im; res(); }; im.onerror = () => res(); im.src = url;
  });
  $('#imgFile').onchange = (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => { await api.image.save(r.result); await loadImage(r.result); ui({ hasImage: true }); toast('Field image set'); };
    r.readAsDataURL(f);
  };
  $('#imgClear').onclick = async () => { await api.image.clear(); fieldImage = null; ui({ hasImage: false }); };
  $('#imgOpacity').oninput = (e) => ui({ imageOpacity: parseFloat(e.target.value) });
  api.image.load().then(async (url) => { if (url) { await loadImage(url); ui({ hasImage: true }); } });

  /* ---------- global shortcuts ---------- */
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input,textarea,select') || e.target.closest?.('dialog')) return;
    if (e.key === ' ' && e.target.matches?.('button')) return;
    const st = store.get(), sel = st.selection, mod = e.ctrlKey || e.metaKey, k = e.key;
    const hasSeg = sel.kind === 'segment' || sel.kind === 'point';
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
    if (mod || e.altKey) return;
    if (k === ' ') { e.preventDefault(); spaceDown = true; if (!e.repeat) togglePlay(); return; }
    if (k === '?') { $('#helpDlg').showModal(); return; }
    if (k.startsWith('Arrow') && (sel.kind === 'point' || sel.kind === 'obstacle')) {
      e.preventDefault();
      const s = e.shiftKey ? 0.1 : 0.5;
      dispatch({ type: 'nudge', dx: k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, dy: k === 'ArrowDown' ? -s : k === 'ArrowUp' ? s : 0, coalesce: 'nudge' });
      return;
    }
    const sg = hasSeg ? st.project.chains[sel.chain]?.segments[sel.seg] : null;
    switch (k) {
      case 'Delete': case 'Backspace':
        if (sel.kind === 'obstacle') dispatch({ type: 'deleteObstacle', index: sel.index });
        else if (sel.kind === 'point' && sel.which === 'control') dispatch({ type: 'removeControl', chain: sel.chain, seg: sel.seg, index: sel.index });
        else if (hasSeg) dispatch({ type: 'deleteSegment', chain: sel.chain, seg: sel.seg });
        break;
      case 'n': case 'N': if (hasSeg) dispatch({ type: 'addSegment', chain: sel.chain, kind: k === 'N' ? 'curve' : 'line' }); else if (st.project.chains.length) dispatch({ type: 'addSegment', chain: st.project.chains.length - 1, kind: k === 'N' ? 'curve' : 'line' }); break;
      case 'c': case 'C': if (sg) dispatch({ type: 'addControl', chain: sel.chain, seg: sel.seg }); break;
      case 'l': case 'L': if (sg) dispatch({ type: 'setSegmentKind', chain: sel.chain, seg: sel.seg, kind: sg.kind === 'line' ? 'curve' : 'line' }); break;
      case '1': case '2': case '3': case '4': if (sg) setHeading(sel, HEADINGS[+k - 1][0]); break;
      case 'o': case 'O': ui({ tool: st.ui.tool === 'obstacle' ? 'select' : 'obstacle' }); break;
      case 'm': case 'M': dispatch({ type: 'mirror' }); break;
      case 'f': case 'F': fit(); break;
      case '+': case '=': zoomAt(size.w / 2, size.h / 2, 1.25); break;
      case '-': case '_': zoomAt(size.w / 2, size.h / 2, 0.8); break;
      case 'Escape':
        if (st.ui.tool !== 'select') ui({ tool: 'select', draft: null }); else dispatch({ type: 'select', selection: { kind: 'none' } });
        break;
      default:
    }
  });

  /* ---------- store subscription ---------- */
  store.subscribe((st) => {
    const projChanged = st.project !== last.project, selChanged = st.selection !== last.selection;
    if (projChanged || selChanged) { renderChains(st); renderInspector(st); }
    if (projChanged) {
      renderTiming(st); renderProjects(st);
      clearTimeout(codeTimer); codeTimer = setTimeout(refreshCode, 120);
      $('#undo').disabled = !store.canUndo(); $('#redo').disabled = !store.canRedo();
    }
    if (st.ui !== last.ui) {
      const u = st.ui;
      $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === u.tool));
      $$('[data-ov]').forEach((b) => b.setAttribute('aria-pressed', u.overlays[b.dataset.ov]));
      $('#play').textContent = u.playing ? 'Pause' : 'Play';
      if (document.activeElement !== $('#scrub')) $('#scrub').value = u.playhead;
      $('#clock').textContent = `${u.playhead.toFixed(2)} / ${derived(st.project).timeline.total.toFixed(2)} s`;
      $('#imgOpacity').value = u.imageOpacity;
      cv.style.cursor = u.tool === 'obstacle' ? 'crosshair' : 'default';
    }
    syncInputs(st);
    last = st;
    schedule();
  });
  store.dispatch({ type: 'setUi', patch: {} });
  last = {};
  const s0 = store.get();
  renderChains(s0); renderInspector(s0); renderTiming(s0); renderProjects(s0); refreshCode(); syncInputs(s0);
  last = s0;
  void className; void w2s;
  return { toast, schedule };
}
