import test from 'node:test';
import assert from 'node:assert/strict';
import { corners, outOfBounds, obbVsAABB } from '../src/collision.js';

test('18x18 robot at 45 deg near the wall leaves the field', () => {
  assert.equal(outOfBounds(corners(10, 72, 0, 18, 18)), false);
  assert.equal(outOfBounds(corners(10, 72, 45, 18, 18)), true); // corner reaches x = 10 - 12.73
  assert.equal(outOfBounds(corners(9, 72, 0, 18, 18)), false);
});

test('OBB vs AABB', () => {
  const r = { x: 20, y: 20, w: 10, h: 10 };
  assert.equal(obbVsAABB(corners(15, 25, 0, 10, 10), r), false); // touching only
  assert.equal(obbVsAABB(corners(16, 25, 0, 10, 10), r), true);
  assert.equal(obbVsAABB(corners(10, 10, 45, 10, 10), r), false);
});
