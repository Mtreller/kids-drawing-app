import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainPan, MAX_ZOOM, snapRotation, solveViewGesture, zoomAroundPoint, type ViewGesture } from './gestures.ts';
import { recolorFringe } from './drawing.ts';

const start = (overrides: Partial<ViewGesture> = {}): ViewGesture => ({
  distance: 100,
  angle: 0,
  center: { x: 700, y: 400 },
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  origin: { x: 500, y: 400 },
  rotationUnlocked: false,
  ...overrides,
});

// Screen position of a page point given view state (transform pivots on origin).
const toScreen = (local: { x: number; y: number }, zoom: number, rotation: number, pan: { x: number; y: number }, origin: { x: number; y: number }) => ({
  x: origin.x + pan.x + zoom * (local.x * Math.cos(rotation) - local.y * Math.sin(rotation)),
  y: origin.y + pan.y + zoom * (local.x * Math.sin(rotation) + local.y * Math.cos(rotation)),
});

test('pinch zoom keeps the page point under the fingers', () => {
  const gesture = start();
  const next = solveViewGesture(gesture, { distance: 250, angle: 0, center: { x: 700, y: 400 } });
  assert.equal(next.zoom, 2.5);
  const screen = toScreen({ x: 200, y: 0 }, next.zoom, next.rotation, next.pan, gesture.origin);
  assert.ok(Math.abs(screen.x - 700) < 1e-6 && Math.abs(screen.y - 400) < 1e-6);
});

test('zoom is clamped to the maximum', () => {
  assert.equal(solveViewGesture(start(), { distance: 5000, angle: 0, center: { x: 700, y: 400 } }).zoom, MAX_ZOOM);
});

test('small accidental twists do not rotate the page', () => {
  const next = solveViewGesture(start(), { distance: 160, angle: 10 * Math.PI / 180, center: { x: 700, y: 400 } });
  assert.equal(next.rotation, 0);
  assert.equal(next.rotationUnlocked, false);
});

test('a deliberate twist rotates without a jump', () => {
  const next = solveViewGesture(start(), { distance: 100, angle: 30 * Math.PI / 180, center: { x: 700, y: 400 } });
  assert.equal(next.rotationUnlocked, true);
  assert.ok(Math.abs(next.rotation - 16 * Math.PI / 180) < 1e-6);
});

test('rotation snaps to quarter turns when close', () => {
  assert.ok(Math.abs(snapRotation(Math.PI / 2 + .05) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(snapRotation(.3) - .3) < 1e-9);
});

test('pan limits scale with the real page size so every corner is reachable', () => {
  const big = constrainPan(4, { x: 5000, y: 5000 }, { width: 1000, height: 750 });
  assert.ok(big.x >= 1500 && big.y >= 1125);
  assert.deepEqual(constrainPan(1, { x: 300, y: -200 }, { width: 1000, height: 750 }), { x: 0, y: 0 });
});

test('wheel zoom keeps the cursor point fixed', () => {
  const origin = { x: 500, y: 400 };
  const pan = zoomAroundPoint(1, 3, { x: 0, y: 0 }, { x: 600, y: 300 }, origin);
  const screen = toScreen({ x: 100, y: -100 }, 3, 0, pan, origin);
  assert.ok(Math.abs(screen.x - 600) < 1e-6 && Math.abs(screen.y - 300) < 1e-6);
});

test('fill recolours the anti-aliased fringe but not colourful neighbours', () => {
  // 3 pixels in a row: grey fringe, saturated green paint, near-black line.
  const data = new Uint8ClampedArray([128, 128, 128, 255, 40, 200, 60, 255, 10, 10, 10, 255]);
  const visited = new Uint8Array(3);
  recolorFringe(data, 3, 1, [0, 1, 2], visited, [255, 255, 255, 255], [255, 0, 0, 255]);
  assert.deepEqual([...data.slice(0, 3)], [128, 0, 0]);
  assert.deepEqual([...data.slice(4, 7)], [40, 200, 60]);
  assert.deepEqual([...data.slice(8, 11)], [10, 10, 10]);
});
