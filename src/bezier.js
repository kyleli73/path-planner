// Pure Bezier math (any degree). Points are {x, y}.

export const segmentPoints = (seg, start) => [
  { x: start.x, y: start.y },
  ...seg.controls.map((c) => ({ x: c.x, y: c.y })),
  { x: seg.end.x, y: seg.end.y },
];

// de Casteljau
export function evalBezier(pts, t) {
  const a = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let r = 1; r < pts.length; r++) {
    for (let i = 0; i < pts.length - r; i++) {
      a[i] = { x: (1 - t) * a[i].x + t * a[i + 1].x, y: (1 - t) * a[i].y + t * a[i + 1].y };
    }
  }
  return a[0];
}

const hodograph = (pts) => {
  const n = pts.length - 1;
  return pts.slice(1).map((p, i) => ({ x: n * (p.x - pts[i].x), y: n * (p.y - pts[i].y) }));
};

export function derivative(pts, t, order = 1) {
  let d = pts;
  for (let k = 0; k < order; k++) {
    if (d.length < 2) return { x: 0, y: 0 };
    d = hodograph(d);
  }
  return evalBezier(d, t);
}

// Signed curvature (1/in), positive = turning CCW.
export function curvature(pts, t) {
  const d1 = derivative(pts, t, 1);
  const d2 = derivative(pts, t, 2);
  const sp = Math.hypot(d1.x, d1.y);
  if (sp < 1e-9) return 0;
  return (d1.x * d2.y - d1.y * d2.x) / (sp * sp * sp);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Adaptive chord-vs-polyline subdivision; the 8 seed intervals stop S-curves
// from looking converged just because the midpoint lies on the chord.
export function arcLength(pts, tol = 1e-5) {
  const rec = (t0, t1, p0, p1, depth) => {
    const tm = (t0 + t1) / 2;
    const pm = evalBezier(pts, tm);
    const chord = dist(p0, p1);
    const two = dist(p0, pm) + dist(pm, p1);
    if (two - chord < tol || depth > 18) return two;
    return rec(t0, tm, p0, pm, depth + 1) + rec(tm, t1, pm, p1, depth + 1);
  };
  let total = 0;
  const K = 8;
  for (let i = 0; i < K; i++) {
    const t0 = i / K, t1 = (i + 1) / K;
    total += rec(t0, t1, evalBezier(pts, t0), evalBezier(pts, t1), 0);
  }
  return total;
}

export function closestT(pts, p, n = 64) {
  let best = 0, bd = Infinity;
  for (let i = 0; i <= n; i++) {
    const d = dist(evalBezier(pts, i / n), p);
    if (d < bd) { bd = d; best = i / n; }
  }
  let lo = Math.max(0, best - 1 / n), hi = Math.min(1, best + 1 / n);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (dist(evalBezier(pts, m1), p) < dist(evalBezier(pts, m2), p)) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = evalBezier(pts, t);
  return { t, point, dist: dist(point, p) };
}
