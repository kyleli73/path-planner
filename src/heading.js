import { derivative, segmentPoints, evalBezier } from './bezier.js';

// Normalize to (-180, 180].
export function normDeg(a) {
  let r = (((a + 180) % 360) + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

// Heading in degrees at parameter t. Linear takes the shortest turn.
export function headingAt(seg, start, t, pts) {
  const mode = seg.heading.mode;
  if (mode === 'constant') return seg.end.h;
  if (mode === 'linear') return start.h + normDeg(seg.end.h - start.h) * t;
  pts = pts || segmentPoints(seg, start);
  let d = derivative(pts, t, 1);
  if (Math.hypot(d.x, d.y) < 1e-9) {
    const t2 = t < 0.5 ? Math.min(1, t + 1e-3) : Math.max(0, t - 1e-3);
    const a = evalBezier(pts, t), b = evalBezier(pts, t2);
    d = t < 0.5 ? { x: b.x - a.x, y: b.y - a.y } : { x: a.x - b.x, y: a.y - b.y };
  }
  let deg = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (seg.heading.reverse) deg += 180;
  return normDeg(deg);
}

// starts[c][s] = implied start pose of segment s in chain c.
export function startsOf(project) {
  let cur = project.startPose;
  return project.chains.map((ch) => ch.segments.map((seg) => {
    const s = { x: cur.x, y: cur.y, h: cur.h };
    cur = seg.end;
    return s;
  }));
}

// Pose at the end of chain index c (or the start pose when nothing precedes).
export function tailPose(project, c) {
  for (let i = Math.min(c, project.chains.length - 1); i >= 0; i--) {
    const segs = project.chains[i].segments;
    if (segs.length) return segs[segs.length - 1].end;
  }
  return project.startPose;
}
