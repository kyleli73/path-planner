import test from 'node:test';
import assert from 'node:assert/strict';
import { chainBlock, generateJava, fmt } from '../src/codegen.js';
import { defaultProject } from '../src/store.js';

const segs = [
  { kind: 'line', controls: [], end: { x: 56, y: 36, h: 180 }, heading: { mode: 'linear' } },
  { kind: 'curve', controls: [{ x: 30, y: 60 }], end: { x: 20, y: 84, h: 180 }, heading: { mode: 'tangential' } },
];

test('two-segment chain matches the Pedro v2 shape exactly', () => {
  const expected = [
    'path1 = follower.pathBuilder()',
    '    .addPath(new BezierLine(new Pose(56, 8), new Pose(56, 36)))',
    '    .setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180))',
    '    .addPath(new BezierCurve(new Pose(56, 36), new Pose(30, 60), new Pose(20, 84)))',
    '    .setTangentHeadingInterpolation()',
    '    .build();',
  ].join('\n');
  assert.equal(chainBlock('path1', segs, { x: 56, y: 8, h: 90 }), expected);
});

test('constant and reversed tangential', () => {
  const s = [
    { controls: [], end: { x: 1.25, y: 2, h: 30.5 }, heading: { mode: 'constant' } },
    { controls: [], end: { x: 3, y: 4, h: 0 }, heading: { mode: 'tangential', reverse: true } },
  ];
  assert.equal(chainBlock('a', s, { x: 0, y: 0, h: 0 }), [
    'a = follower.pathBuilder()',
    '    .addPath(new BezierLine(new Pose(0, 0), new Pose(1.25, 2)))',
    '    .setConstantHeadingInterpolation(Math.toRadians(30.5))',
    '    .addPath(new BezierLine(new Pose(1.25, 2), new Pose(3, 4)))',
    '    .setTangentHeadingInterpolation()',
    '    .setReversed()',
    '    .build();',
  ].join('\n'));
});

test('full class has field, startPose and buildPaths', () => {
  const j = generateJava(defaultProject('Red Near'));
  assert.ok(j.includes('public class RedNearPaths {'));
  assert.ok(j.includes('public Pose startPose = new Pose(56, 9, Math.toRadians(90));'));
  assert.ok(j.includes('    public PathChain path1;'));
  assert.ok(j.includes('public void buildPaths(Follower follower) {'));
});

test('fmt trims noise', () => {
  assert.equal(fmt(56.0000001), '56');
  assert.equal(fmt(-0.0001), '0');
  assert.equal(fmt(30.12349), '30.123');
});
