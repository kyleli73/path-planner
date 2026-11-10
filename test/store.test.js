import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, createStore, defaultProject } from '../src/store.js';

const project = () => ({
  id: 'p', name: 't', updatedAt: 0,
  robot: { w: 18, l: 18, maxVel: 50, maxAccel: 40, maxLatAccel: 30 },
  startPose: { x: 44, y: 20, h: 30 },
  chains: [{ id: 'c', name: 'path1', segments: [
    { id: 's', kind: 'curve', controls: [{ x: 30, y: 60 }], end: { x: 20, y: 84, h: 180 }, heading: { mode: 'tangential' } },
  ] }],
  obstacles: [{ x: 10, y: 5, w: 20, h: 10 }],
});
const st = (p) => ({ project: p, selection: { kind: 'none' }, ui: {} });

test('mirror: 180-degree rotation (144 - x, 144 - y, h + 180)', () => {
  const n = reduce(st(project()), { type: 'mirror' }).project;
  assert.deepEqual(n.startPose, { x: 100, y: 124, h: 210 });
  assert.deepEqual(n.chains[0].segments[0].controls, [{ x: 114, y: 84 }]);
  assert.deepEqual(n.chains[0].segments[0].end, { x: 124, y: 60, h: 0 });
  assert.deepEqual(n.obstacles[0], { x: 114, y: 129, w: 20, h: 10 });
  assert.deepEqual(n.chains[0].segments[0].start, { x: 100, y: 124, h: 210 });
  assert.equal(n.alliance, 'blue');
});

test('mirror twice restores geometry', () => {
  const a = reduce(reduce(st(project()), { type: 'mirror' }), { type: 'mirror' }).project;
  const b = project();
  assert.deepEqual(a.startPose, b.startPose);
  assert.deepEqual(a.chains[0].segments[0].end, b.chains[0].segments[0].end);
  assert.deepEqual(a.obstacles, b.obstacles);
});

test('endpoints chain: moving an end moves the next segment start', () => {
  let s = st(defaultProject());
  s = reduce(s, { type: 'movePoint', chain: 0, seg: 0, which: 'end', x: 60, y: 40 });
  assert.deepEqual(s.project.chains[0].segments[0].end, { x: 60, y: 40, h: 45 });
});

test('curve <-> line conversion keeps kind in sync', () => {
  let s = st(project());
  s = reduce(s, { type: 'removeControl', chain: 0, seg: 0, index: 0 });
  assert.equal(s.project.chains[0].segments[0].kind, 'line');
  s = reduce(s, { type: 'addControl', chain: 0, seg: 0 });
  assert.equal(s.project.chains[0].segments[0].kind, 'curve');
  assert.deepEqual(s.project.chains[0].segments[0].controls, [{ x: 32, y: 52 }]);
});

test('undo/redo and drag coalescing', () => {
  const store = createStore(project());
  const before = store.get().project;
  for (let i = 1; i <= 5; i++) store.dispatch({ type: 'movePoint', chain: 0, seg: 0, which: 'end', x: i, y: i, coalesce: 'd' });
  store.endCoalesce();
  assert.equal(store.get().project.chains[0].segments[0].end.x, 5);
  store.undo();
  assert.equal(store.get().project, before);
  store.redo();
  assert.equal(store.get().project.chains[0].segments[0].end.x, 5);
});
