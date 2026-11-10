import test from 'node:test';
import assert from 'node:assert/strict';
import { arcLength, evalBezier, curvature, closestT } from '../src/bezier.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('line (0,0)->(3,4) has length 5', () => {
  near(arcLength([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
});

test('quadratic midpoint', () => {
  const m = evalBezier([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 0 }], 0.5);
  assert.deepEqual(m, { x: 10, y: 10 });
});

test('cubic midpoint via de Casteljau', () => {
  const m = evalBezier([{ x: 0, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 0 }], 0.5);
  assert.deepEqual(m, { x: 4, y: 6 });
});

test('curvature of a straight line is 0', () => {
  assert.equal(curvature([{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.3), 0);
  near(curvature([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }], 0.5), 0);
});

test('quarter-ish arc has positive curvature for a left turn', () => {
  assert.ok(curvature([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.5) > 0);
});

test('closestT on a line', () => {
  const r = closestT([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 2.5, y: 3 });
  near(r.t, 0.25, 1e-4);
  near(r.dist, 3, 1e-4);
});
