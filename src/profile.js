import { evalBezier, curvature, segmentPoints } from './bezier.js';
import { headingAt, normDeg, startsOf } from './heading.js';
import { analyzeSamples } from './collision.js';
import { FIELD_OBSTACLES } from './field.js';

const V_FLOOR = 1; // in/s; keeps near-cusp samples from producing infinite times

// Curvature-limited velocity profile for one chain (starts and ends at rest).
export function profileChain(segments, startPose, robot, N = 240) {
  const samples = [];
  let cur = startPose;
  segments.forEach((seg, si) => {
    const pts = segmentPoints(seg, cur);
    for (let j = si === 0 ? 0 : 1; j <= N; j++) {
      const t = j / N, p = evalBezier(pts, t);
      samples.push({ x: p.x, y: p.y, t, seg: si, k: curvature(pts, t), h: headingAt(seg, cur, t, pts) });
    }
    cur = seg.end;
  });
  const n = samples.length;
  if (n < 2) return { samples, segTimes: segments.map(() => 0), total: 0 };
  const { maxVel, maxAccel, maxLatAccel } = robot;
  let s = 0;
  const ds = [0];
  samples.forEach((p, i) => {
    if (i) { ds.push(Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y)); s += ds[i]; }
    p.s = s;
  });
  const v = samples.map((p) => {
    const lat = Math.abs(p.k) > 1e-9 ? Math.sqrt(maxLatAccel / Math.abs(p.k)) : Infinity;
    return Math.max(Math.min(maxVel, lat), Math.min(V_FLOOR, maxVel));
  });
  v[0] = 0; v[n - 1] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * maxAccel * ds[i]));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * maxAccel * ds[i + 1]));
  const segTimes = segments.map(() => 0);
  let time = 0;
  samples[0].v = v[0]; samples[0].time = 0;
  for (let i = 1; i < n; i++) {
    const sum = v[i - 1] + v[i];
    const dt = ds[i] > 0 && sum > 1e-9 ? (2 * ds[i]) / sum : 0;
    time += dt;
    segTimes[samples[i].seg] += dt;
    samples[i].v = v[i]; samples[i].time = time;
  }
  return { samples, segTimes, total: time };
}

export function buildTimeline(project, N = 240) {
  const starts = startsOf(project);
  let offset = 0;
  const chains = project.chains.map((ch, c) => {
    const p = ch.segments.length ? profileChain(ch.segments, starts[c][0], project.robot, N) : { samples: [], segTimes: [], total: 0 };
    p.offset = offset;
    offset += p.total;
    return p;
  });
  return { chains, total: offset };
}

export function poseAt(tl, T, project) {
  const withS = tl.chains.filter((c) => c.samples.length);
  if (!withS.length) return { ...project.startPose };
  let ch = withS.find((c) => T <= c.offset + c.total + 1e-9) || withS[withS.length - 1];
  const lt = Math.min(Math.max(T - ch.offset, 0), ch.total);
  const S = ch.samples;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].time <= lt) lo = m; else hi = m; }
  const a = S[lo], b = S[hi];
  const f = b.time > a.time ? (lt - a.time) / (b.time - a.time) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + normDeg(b.h - a.h) * f };
}

const memo = new WeakMap();
// Everything render/UI needs, computed once per project object.
export function derived(project) {
  let d = memo.get(project);
  if (d) return d;
  const timeline = buildTimeline(project);
  const hitSet = new Set();
  let oobCount = 0, hitCount = 0;
  timeline.chains.forEach((c) => {
    c.analysis = analyzeSamples(c.samples, project.robot, FIELD_OBSTACLES.concat(project.obstacles));
    oobCount += c.analysis.oobCount; hitCount += c.analysis.hitCount;
    c.analysis.hitSet.forEach((i) => hitSet.add(i));
  });
  const waits = project.chains.map((ch) => ch.segments.reduce((a, s) => a + (s.action?.wait || 0), 0));
  const waitTotal = waits.reduce((a, b) => a + b, 0);
  d = { timeline, oobCount, hitCount, hitSet, waits, waitTotal };
  memo.set(project, d);
  return d;
}
