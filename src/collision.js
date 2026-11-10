
// Robot length runs along its heading, width is lateral.
export function corners(x, y, hDeg, w, l) {
  const r = (hDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const hl = l / 2, hw = w / 2;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, b]) => ({ x: x + a * c - b * s, y: y + a * s + b * c }));
}

export function outOfBounds(cs, size = 144, eps = 1e-9) {
  return cs.some((p) => p.x < -eps || p.y < -eps || p.x > size + eps || p.y > size + eps);
}

const project = (poly, ax, ay) => {
  let min = Infinity, max = -Infinity;
  for (const p of poly) { const d = p.x * ax + p.y * ay; if (d < min) min = d; if (d > max) max = d; }
  return [min, max];
};

// Separating-axis test; touching edges do not count as a collision.
export function obbVsAABB(cs, rect) {
  const box = [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ];
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < 2; i++) {
    const a = cs[i], b = cs[i + 1];
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
    axes.push([-ey / len, ex / len]);
  }
  for (const [ax, ay] of axes) {
    const [a0, a1] = project(cs, ax, ay), [b0, b1] = project(box, ax, ay);
    if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
  }
  return true;
}

export function analyzeSamples(samples, robot, obstacles, size = 144) {
  const oob = [], hit = [], hitSet = new Set();
  let oobCount = 0, hitCount = 0;
  for (const s of samples) {
    const cs = corners(s.x, s.y, s.h, robot.w, robot.l);
    const o = outOfBounds(cs, size);
    let hh = false;
    obstacles.forEach((r, i) => { if (obbVsAABB(cs, r)) { hh = true; hitSet.add(i); } });
    oob.push(o); hit.push(hh);
    if (o) oobCount++;
    if (hh) hitCount++;
  }
  return { oob, hit, oobCount, hitCount, hitSet };
}
