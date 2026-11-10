import test from 'node:test';
import assert from 'node:assert/strict';
import { startWarnings, FIELD_OBSTACLES, FLOWERS } from '../src/field.js';

const robot = { w: 18, l: 18 };

test('default red start is legal', () => {
  assert.deepEqual(startWarnings({ x: 60, y: 9, h: 90 }, robot, 'red'), []);
});
test('(36,9,90) is flagged as in the loading zone', () => {
  assert.ok(startWarnings({ x: 36, y: 9, h: 90 }, robot, 'red').some((m) => m.includes('LOADING ZONE')));
});
test('(60,40,90) is flagged as not touching a wall', () => {
  assert.ok(startWarnings({ x: 60, y: 40, h: 90 }, robot, 'red').some((m) => m.includes('not touching')));
});
test('wrong side and flower overlap are flagged', () => {
  assert.ok(startWarnings({ x: 60, y: 9, h: 90 }, robot, 'blue').some((m) => m.includes('alliance side')));
  assert.ok(startWarnings({ x: 96, y: 9, h: 90 }, robot, 'red').some((m) => m.includes('FLOWER')));
  assert.deepEqual(startWarnings({ x: 84, y: 135, h: 270 }, robot, 'blue'), []);
});
test('field obstacles: HIVE plus 4 six-inch FLOWERs', () => {
  assert.equal(FIELD_OBSTACLES.length, 5);
  assert.deepEqual(FLOWERS[1], { name: 'FLOWER 2', x: 93, y: 0, w: 6, h: 6 });
});
