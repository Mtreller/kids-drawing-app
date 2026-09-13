import assert from 'node:assert/strict';
import test from 'node:test';
import { createTouchTapTracker, isTouchLikePointer, isUiTouchTarget } from './touchTap.ts';

function touchList(touches: Array<{ identifier: number; clientX: number; clientY: number }>) {
  return {
    length: touches.length,
    item(index: number) { return touches[index] ?? null; },
  } as unknown as TouchList;
}

function event(touches: Array<{ identifier: number; clientX: number; clientY: number }>, changed = touches) {
  return { touches: touchList(touches), changedTouches: touchList(changed) };
}

test('two-finger tap undoes even when fingers land far apart', () => {
  const tracker = createTouchTapTracker();
  tracker.onStart(event([{ identifier: 1, clientX: 10, clientY: 10 }]));
  tracker.onStart(event(
    [{ identifier: 1, clientX: 10, clientY: 10 }, { identifier: 2, clientX: 120, clientY: 80 }],
    [{ identifier: 2, clientX: 120, clientY: 80 }],
  ));
  assert.equal(tracker.onEnd(event(
    [{ identifier: 2, clientX: 118, clientY: 81 }],
    [{ identifier: 1, clientX: 12, clientY: 11 }],
  )), null);
  assert.equal(tracker.onEnd(event([], [{ identifier: 2, clientX: 118, clientY: 81 }])), 'undo');
});

test('three-finger tap redoes', () => {
  const tracker = createTouchTapTracker();
  tracker.onStart(event([{ identifier: 1, clientX: 0, clientY: 0 }]));
  tracker.onStart(event(
    [{ identifier: 1, clientX: 0, clientY: 0 }, { identifier: 2, clientX: 20, clientY: 0 }],
    [{ identifier: 2, clientX: 20, clientY: 0 }],
  ));
  tracker.onStart(event(
    [{ identifier: 1, clientX: 0, clientY: 0 }, { identifier: 2, clientX: 20, clientY: 0 }, { identifier: 3, clientX: 40, clientY: 0 }],
    [{ identifier: 3, clientX: 40, clientY: 0 }],
  ));
  assert.equal(tracker.onEnd(event(
    [{ identifier: 2, clientX: 20, clientY: 0 }, { identifier: 3, clientX: 40, clientY: 0 }],
    [{ identifier: 1, clientX: 0, clientY: 0 }],
  )), null);
  assert.equal(tracker.onEnd(event(
    [{ identifier: 3, clientX: 40, clientY: 0 }],
    [{ identifier: 2, clientX: 20, clientY: 0 }],
  )), null);
  assert.equal(tracker.onEnd(event([], [{ identifier: 3, clientX: 40, clientY: 0 }])), 'redo');
});

test('a pinch or swipe is not a tap', () => {
  const tracker = createTouchTapTracker({ movePx: 20 });
  tracker.onStart(event([{ identifier: 1, clientX: 0, clientY: 0 }]));
  tracker.onStart(event(
    [{ identifier: 1, clientX: 0, clientY: 0 }, { identifier: 2, clientX: 10, clientY: 0 }],
    [{ identifier: 2, clientX: 10, clientY: 0 }],
  ));
  tracker.onMove(event([
    { identifier: 1, clientX: 0, clientY: 0 },
    { identifier: 2, clientX: 80, clientY: 0 },
  ]));
  assert.equal(tracker.onEnd(event([], [
    { identifier: 1, clientX: 0, clientY: 0 },
    { identifier: 2, clientX: 80, clientY: 0 },
  ])), null);
});

test('a single-finger tap is ignored', () => {
  const tracker = createTouchTapTracker();
  tracker.onStart(event([{ identifier: 1, clientX: 4, clientY: 4 }]));
  assert.equal(tracker.onEnd(event([], [{ identifier: 1, clientX: 4, clientY: 5 }])), null);
});

test('touch-like pointers include empty Android types', () => {
  assert.equal(isTouchLikePointer({ pointerType: 'touch' }), true);
  assert.equal(isTouchLikePointer({ pointerType: '' }), true);
  assert.equal(isTouchLikePointer({ pointerType: 'mouse' }), false);
});

test('chrome UI chrome is ignored as a tap target', () => {
  const button = { closest: (selector: string) => selector.includes('.side-controls') ? {} : null };
  assert.equal(isUiTouchTarget(button as unknown as EventTarget), true);
  assert.equal(isUiTouchTarget(null), false);
});
