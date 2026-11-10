import test from 'node:test';
import assert from 'node:assert/strict';
import { headingAt, normDeg } from '../src/heading.js';

const seg = (mode, end, extra = {}) => ({ kind: 'line', controls: [], end, heading: { mode, ...extra } });

test('linear 90 -> 180 at t=0.5 is 135', () => {
  assert.equal(headingAt(seg('linear', { x: 10, y: 0, h: 180 }), { x: 0, y: 0, h: 90 }, 0.5), 135);
});

test('linear takes the shortest turn across the wrap', () => {
  assert.equal(headingAt(seg('linear', { x: 10, y: 0, h: -170 }), { x: 0, y: 0, h: 170 }, 0.5), 180);
});

test('constant uses the end heading', () => {
  assert.equal(headingAt(seg('constant', { x: 10, y: 0, h: 45 }), { x: 0, y: 0, h: 0 }, 0.7), 45);
});

test('tangential follows the path, reversed adds 180', () => {
  const s = seg('tangential', { x: 0, y: 10, h: 0 });
  assert.equal(headingAt(s, { x: 0, y: 0, h: 0 }, 0.5), 90);
  const r = seg('tangential', { x: 0, y: 10, h: 0 }, { reverse: true });
  assert.equal(headingAt(r, { x: 0, y: 0, h: 0 }, 0.5), -90);
});

test('normDeg', () => {
  assert.equal(normDeg(270), -90);
  assert.equal(normDeg(-180), 180);
});
