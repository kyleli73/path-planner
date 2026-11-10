import { corners, obbVsAABB } from './collision.js';

// FTC BIOBUZZ 2026-27 field elements, Pedro coordinates (inches, origin bottom-left). Single source of truth.
export const HIVE = { name: 'HIVE', x: 52, y: 46, w: 40, h: 52 };
export const FLOWER_SIZE = 6;
export const FLOWER_CENTERS = [[48, 141], [96, 3], [3, 48], [141, 96]];
export const FLOWERS = FLOWER_CENTERS.map(([cx, cy], i) => ({
  name: `FLOWER ${i + 1}`, x: cx - FLOWER_SIZE / 2, y: cy - FLOWER_SIZE / 2, w: FLOWER_SIZE, h: FLOWER_SIZE,
}));
// Built-in, non-deletable obstacles. Collision checks use these before user obstacles.
export const FIELD_OBSTACLES = [HIVE, ...FLOWERS];

export const LOADING_ZONES = [
  { name: 'Red LOADING ZONE', alliance: 'red', x: 24, y: 0, w: 24, h: 11 },
  { name: 'Blue LOADING ZONE', alliance: 'blue', x: 96, y: 133, w: 24, h: 11 },
];
export const GARDENS = [
  { name: 'Red GARDEN', alliance: 'red', x: 142, y: 0, w: 2, h: 23 },
  { name: 'Blue GARDEN', alliance: 'blue', x: 0, y: 121, w: 2, h: 23 },
];
export const ZONES = [...LOADING_ZONES, ...GARDENS];

export const SIDE_Y = 72; // red is y < 72, blue is y > 72
export const ACTIONS = ['launch', 'intakePollen', 'flower', 'garden', 'park'];

// G304 start legality. Returns a list of warning strings (empty when legal).
export function startWarnings(pose, robot, alliance = 'red', size = 144) {
  const cs = corners(pose.x, pose.y, pose.h, robot.w, robot.l), e = 1e-6, out = [];
  const ys = cs.map((p) => p.y), xs = cs.map((p) => p.x);
  const off = alliance === 'red' ? Math.max(...ys) > SIDE_Y + e : Math.min(...ys) < SIDE_Y - e;
  if (off) out.push(`Start footprint is not fully on the ${alliance} alliance side.`);
  if (Math.min(...xs) > e && Math.min(...ys) > e && Math.max(...xs) < size - e && Math.max(...ys) < size - e) {
    out.push('Start footprint is not touching a perimeter wall.');
  }
  if (LOADING_ZONES.some((z) => obbVsAABB(cs, z))) out.push('Start footprint is in a LOADING ZONE.');
  if (FLOWERS.some((f) => obbVsAABB(cs, f))) out.push('Start footprint overlaps a FLOWER.');
  return out;
}
