import { segmentPoints } from './bezier.js';
import { startsOf } from './heading.js';
import { derived, poseAt } from './profile.js';
import { corners, outOfBounds, obbVsAABB } from './collision.js';
import { FIELD } from './store.js';
import { FIELD_OBSTACLES, ZONES } from './field.js';

export const RULER = 18;
const CHAIN_COLORS = ['#14b8a6', '#60a5fa', '#f59e0b', '#c084fc', '#f472b6', '#a3e635'];
export const chainColor = (i) => CHAIN_COLORS[i % CHAIN_COLORS.length];

export const w2s = (v, x, y) => [v.ox + x * v.scale, v.oy - y * v.scale];
export const s2w = (v, sx, sy) => ({ x: (sx - v.ox) / v.scale, y: (v.oy - sy) / v.scale });

export function fitView(w, h) {
  const m = RULER + 14;
  const scale = Math.max(1, Math.min(w - 2 * m, h - 2 * m) / FIELD);
  return { scale, ox: (w - FIELD * scale) / 2, oy: (h + FIELD * scale) / 2 };
}

function poly(ctx, v, cs) {
  cs.forEach((p, i) => { const [x, y] = w2s(v, p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
}

function drawField(ctx, v, ui, image) {
  const [x0, y0] = w2s(v, 0, FIELD), S = FIELD * v.scale;
  ctx.fillStyle = '#121a23';
  ctx.fillRect(x0, y0, S, S);
  if (image) {
    ctx.globalAlpha = ui.imageOpacity;
    ctx.drawImage(image, x0, y0, S, S);
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i <= 144; i += 6) {
    const major = i % 24 === 0;
    if (!major && v.scale < 3.5) continue;
    ctx.strokeStyle = major ? 'rgba(148,163,184,.30)' : 'rgba(148,163,184,.10)';
    ctx.lineWidth = major ? 1 : 0.5;
    const [gx] = w2s(v, i, 0), [, gy] = w2s(v, 0, i);
    ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y0 + S); ctx.moveTo(x0, gy); ctx.lineTo(x0 + S, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, S, S);
}

function drawRulers(ctx, v, size, cursor) {
  const { w, h } = size;
  ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, w, RULER); ctx.fillRect(0, 0, RULER, h);
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, RULER + .5); ctx.lineTo(w, RULER + .5); ctx.moveTo(RULER + .5, 0); ctx.lineTo(RULER + .5, h); ctx.stroke();
  const step = [1, 2, 6, 12, 24].find((s) => s * v.scale >= 34) || 24;
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= FIELD; i += step) {
    const [sx] = w2s(v, i, 0), [, sy] = w2s(v, 0, i);
    if (sx > RULER && sx < w) { ctx.textAlign = 'center'; ctx.fillText(i, sx, 9); ctx.fillRect(sx, RULER - 4, 1, 4); }
    if (sy > RULER && sy < h) { ctx.textAlign = 'center'; ctx.save(); ctx.translate(9, sy); ctx.rotate(-Math.PI / 2); ctx.fillText(i, 0, 0); ctx.restore(); ctx.fillRect(RULER - 4, sy, 4, 1); }
  }
  if (cursor) {
    const [sx, sy] = w2s(v, cursor.x, cursor.y);
    ctx.fillStyle = '#14b8a6';
    ctx.fillRect(sx - 0.5, 0, 1, RULER); ctx.fillRect(0, sy - 0.5, RULER, 1);
  }
  ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, RULER, RULER);
}

export function render(ctx, st, size, image) {
  const { w, h } = size;
  ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, w, h);
  const v = st.ui.view;
  if (!v) return;
  const P = st.project, ov = st.ui.overlays, D = derived(P), sel = st.selection;
  ctx.save();
  ctx.beginPath(); ctx.rect(RULER, RULER, w - RULER, h - RULER); ctx.clip();
  drawField(ctx, v, st.ui, image);

  if (ov.zones) {
    ctx.lineWidth = 1.5; ctx.font = `${Math.max(9, 3 * v.scale)}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ZONES.forEach((z) => {
      const [x, y] = w2s(v, z.x, z.y + z.h), col = z.alliance === 'red' ? '#f87171' : '#60a5fa';
      ctx.strokeStyle = col; ctx.setLineDash([5, 3]); ctx.strokeRect(x, y, z.w * v.scale, z.h * v.scale); ctx.setLineDash([]);
      if (z.w > 5) { ctx.fillStyle = col; ctx.fillText(z.name.includes('LOADING') ? 'LOADING ZONE' : 'GARDEN', x + 3, y + 3); }
    });
  }

  if (ov.obstacles) {
    const NF = FIELD_OBSTACLES.length;
    FIELD_OBSTACLES.forEach((o, i) => {
      const [x, y] = w2s(v, o.x, o.y + o.h), hit = D.hitSet.has(i);
      ctx.fillStyle = hit ? 'rgba(239,68,68,.45)' : 'rgba(148,163,184,.28)';
      ctx.strokeStyle = hit ? '#ef4444' : '#94a3b8'; ctx.lineWidth = 1;
      ctx.fillRect(x, y, o.w * v.scale, o.h * v.scale); ctx.strokeRect(x, y, o.w * v.scale, o.h * v.scale);
    });
    P.obstacles.forEach((o, i) => {
      const [x, y] = w2s(v, o.x, o.y + o.h), hit = D.hitSet.has(NF + i);
      ctx.fillStyle = hit ? 'rgba(239,68,68,.45)' : 'rgba(245,158,11,.28)';
      ctx.strokeStyle = sel.kind === 'obstacle' && sel.index === i ? '#fff' : hit ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = sel.kind === 'obstacle' && sel.index === i ? 2 : 1;
      ctx.fillRect(x, y, o.w * v.scale, o.h * v.scale); ctx.strokeRect(x, y, o.w * v.scale, o.h * v.scale);
    });
    const d = st.ui.draft;
    if (d) {
      const [x, y] = w2s(v, d.x, d.y + d.h);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = '#f59e0b'; ctx.strokeRect(x, y, d.w * v.scale, d.h * v.scale); ctx.setLineDash([]);
    }
  }

  const rb = P.robot;
  if (ov.swept) {
    ctx.fillStyle = 'rgba(20,184,166,.07)';
    ctx.beginPath();
    D.timeline.chains.forEach((c) => c.samples.forEach((s, i) => { if (i % 4 === 0) poly(ctx, v, corners(s.x, s.y, s.h, rb.w, rb.l)); }));
    ctx.fill();
  }

  const kRef = rb.maxLatAccel / (rb.maxVel * rb.maxVel); // curvature where lateral limit equals maxVel
  const selChain = sel.kind === 'segment' || sel.kind === 'point' ? sel.chain : -1;
  D.timeline.chains.forEach((c, ci) => {
    const S = c.samples;
    if (S.length < 2) return;
    ctx.lineWidth = ci === selChain ? 3.5 : 2.5; ctx.lineCap = 'round';
    ctx.globalAlpha = selChain >= 0 && ci !== selChain ? 0.55 : 1;
    if (ov.heat) {
      for (let i = 1; i < S.length; i++) {
        const r = Math.min(1, Math.abs(S[i].k) / kRef);
        ctx.strokeStyle = `hsl(${120 * (1 - r)},85%,52%)`;
        ctx.beginPath(); ctx.moveTo(...w2s(v, S[i - 1].x, S[i - 1].y)); ctx.lineTo(...w2s(v, S[i].x, S[i].y)); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = chainColor(ci);
      ctx.beginPath(); S.forEach((p, i) => { const [x, y] = w2s(v, p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (ov.bounds || ov.obstacles) {
      ctx.fillStyle = '#ef4444';
      S.forEach((p, i) => {
        if ((ov.bounds && c.analysis.oob[i]) || (ov.obstacles && c.analysis.hit[i])) {
          if (i % 3) return;
          const [x, y] = w2s(v, p.x, p.y); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
        }
      });
    }
    if (ov.ticks) {
      ctx.strokeStyle = 'rgba(226,232,240,.8)'; ctx.lineWidth = 1.2;
      let next = 0;
      S.forEach((p) => {
        if (p.s < next) return;
        next = p.s + 8;
        const r = (p.h * Math.PI) / 180, [x, y] = w2s(v, p.x, p.y);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(r) * 11, y - Math.sin(r) * 11); ctx.stroke();
      });
    }
  });

  // control polygons and handles
  const starts = startsOf(P);
  P.chains.forEach((ch, ci) => ch.segments.forEach((sg, si) => {
    const pts = segmentPoints(sg, starts[ci][si]);
    const isSel = (sel.kind === 'segment' || sel.kind === 'point') && sel.chain === ci && sel.seg === si;
    if (sg.controls.length) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = isSel ? 'rgba(250,204,21,.8)' : 'rgba(250,204,21,.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = w2s(v, p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
      sg.controls.forEach((c, k) => {
        const [x, y] = w2s(v, c.x, c.y), on = isSel && sel.kind === 'point' && sel.which === 'control' && sel.index === k;
        ctx.fillStyle = on ? '#fff' : '#facc15'; ctx.fillRect(x - 5, y - 5, 10, 10);
      });
    }
    const [x, y] = w2s(v, sg.end.x, sg.end.y), on = sel.kind === 'point' && sel.chain === ci && sel.seg === si && sel.which === 'end';
    ctx.fillStyle = on ? '#fff' : chainColor(ci); ctx.strokeStyle = '#0b1117'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.stroke();
    if (sg.action) {
      ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(x + 9, y - 9, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fed7aa'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(sg.action.wait ? `${sg.action.type} ${sg.action.wait}s` : sg.action.type, x + 16, y - 9);
    }
  }));
  const [sx, sy] = w2s(v, P.startPose.x, P.startPose.y);
  ctx.fillStyle = '#22c55e'; ctx.strokeStyle = '#0b1117'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 9, sy); ctx.lineTo(sx, sy + 9); ctx.lineTo(sx - 9, sy); ctx.closePath(); ctx.fill(); ctx.stroke();

  if (ov.footprint) {
    const pose = poseAt(D.timeline, st.ui.playhead, P);
    const cs = corners(pose.x, pose.y, pose.h, rb.w, rb.l);
    const bad = outOfBounds(cs) || FIELD_OBSTACLES.concat(P.obstacles).some((o) => obbVsAABB(cs, o));
    ctx.beginPath(); poly(ctx, v, cs);
    ctx.fillStyle = bad ? 'rgba(239,68,68,.35)' : 'rgba(20,184,166,.28)'; ctx.fill();
    ctx.strokeStyle = bad ? '#ef4444' : '#14b8a6'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(...w2s(v, cs[0].x, cs[0].y)); ctx.lineTo(...w2s(v, cs[1].x, cs[1].y)); ctx.stroke(); // front edge
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(...w2s(v, pose.x, pose.y), 2.5, 0, 7); ctx.fill();
  }
  ctx.restore();
  drawRulers(ctx, v, size, st.ui.cursor);
  if (ov.bounds && D.oobCount) {
    ctx.fillStyle = 'rgba(239,68,68,.92)'; ctx.fillRect(w / 2 - 110, RULER + 8, 220, 22);
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Footprint leaves the field', w / 2, RULER + 19);
  }
}

// Returns {type, sel?} for the thing under a screen point, or null.
export function hitTest(st, sx, sy) {
  const v = st.ui.view, P = st.project;
  if (!v) return null;
  const R = 12;
  const near = (p) => Math.hypot(...w2s(v, p.x, p.y).map((c, i) => c - (i ? sy : sx)));
  let best = null, bd = R;
  const consider = (d, r) => { if (d <= bd) { bd = d; best = r; } };
  P.chains.forEach((ch, c) => ch.segments.forEach((sg, s) => {
    sg.controls.forEach((p, index) => consider(near(p), { type: 'point', sel: { kind: 'point', chain: c, seg: s, which: 'control', index } }));
  }));
  if (best) return best;
  P.chains.forEach((ch, c) => ch.segments.forEach((sg, s) => consider(near(sg.end), { type: 'point', sel: { kind: 'point', chain: c, seg: s, which: 'end', index: 0 } })));
  if (best) return best;
  if (near(P.startPose) <= R) return { type: 'start' };
  const w = s2w(v, sx, sy);
  for (let i = P.obstacles.length - 1; i >= 0; i--) {
    const o = P.obstacles[i];
    if (w.x >= o.x && w.x <= o.x + o.w && w.y >= o.y && w.y <= o.y + o.h) return { type: 'obstacle', sel: { kind: 'obstacle', index: i } };
  }
  const D = derived(P);
  bd = 9;
  D.timeline.chains.forEach((c, ci) => {
    for (let i = 1; i < c.samples.length; i++) {
      const a = w2s(v, c.samples[i - 1].x, c.samples[i - 1].y), b = w2s(v, c.samples[i].x, c.samples[i].y);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L));
      const d = Math.hypot(sx - (a[0] + t * dx), sy - (a[1] + t * dy));
      consider(d, { type: 'segment', sel: { kind: 'segment', chain: ci, seg: c.samples[i].seg } });
    }
  });
  return best;
}
