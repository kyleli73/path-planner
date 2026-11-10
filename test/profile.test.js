import test from 'node:test';
import assert from 'node:assert/strict';
import { profileChain } from '../src/profile.js';

test('48 in straight line with maxVel 40, maxAccel 40 takes 2.2 s', () => {
  const seg = { kind: 'line', controls: [], end: { x: 48, y: 0, h: 0 }, heading: { mode: 'constant' } };
  const p = profileChain([seg], { x: 0, y: 0, h: 0 }, { maxVel: 40, maxAccel: 40, maxLatAccel: 30 }, 240);
  // 1 s accel (20 in) + 1 s decel (20 in) + 8 in cruise at 40 in/s = 0.2 s
  assert.ok(Math.abs(p.total - 2.2) < 1e-3, String(p.total));
  assert.ok(Math.abs(p.segTimes[0] - 2.2) < 1e-3);
  assert.equal(Math.max(...p.samples.map((s) => s.v)), 40);
});

test('short line never reaches maxVel (triangular profile)', () => {
  const seg = { kind: 'line', controls: [], end: { x: 20, y: 0, h: 0 }, heading: { mode: 'constant' } };
  const p = profileChain([seg], { x: 0, y: 0, h: 0 }, { maxVel: 40, maxAccel: 40, maxLatAccel: 30 }, 240);
  // peak v = sqrt(a*d) = sqrt(800); t = 2*v/a
  assert.ok(Math.abs(p.total - (2 * Math.sqrt(800)) / 40) < 1e-3);
});

test('tight curve is slower than a line of the same length', () => {
  const line = { kind: 'line', controls: [], end: { x: 40, y: 0, h: 0 }, heading: { mode: 'tangential' } };
  const arc = { kind: 'curve', controls: [{ x: 20, y: 30 }], end: { x: 40, y: 0, h: 0 }, heading: { mode: 'tangential' } };
  const r = { maxVel: 60, maxAccel: 60, maxLatAccel: 20 };
  const a = profileChain([line], { x: 0, y: 0, h: 0 }, r).total;
  const b = profileChain([arc], { x: 0, y: 0, h: 0 }, r).total;
  assert.ok(b > a);
});
