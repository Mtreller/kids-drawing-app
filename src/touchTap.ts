export const TOUCH_TAP_MOVE_PX = 28;
export const TOUCH_TAP_MAX_MS = 500;

export type TouchTapAction = 'undo' | 'redo';

type TapPoint = { x: number; y: number };

export function isTouchLikePointer(event: { pointerType: string }) {
  return event.pointerType !== 'mouse';
}

export function isUiTouchTarget(target: EventTarget | null) {
  return Boolean((target as Element | null)?.closest?.('.side-controls, .workspace-hud, .topbar, .palette, .tool-dock'));
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createTouchTapTracker(options?: { movePx?: number; maxMs?: number }) {
  const movePx = options?.movePx ?? TOUCH_TAP_MOVE_PX;
  const maxMs = options?.maxMs ?? TOUCH_TAP_MAX_MS;
  let maxFingers = 0;
  let startedAt = 0;
  let moved = false;
  const starts = new Map<number, TapPoint>();

  function reset() {
    maxFingers = 0;
    startedAt = 0;
    moved = false;
    starts.clear();
  }

  function markMoved(touch: { identifier: number; clientX: number; clientY: number }) {
    const start = starts.get(touch.identifier);
    if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > movePx) moved = true;
  }

  return {
    reset,
    get maxFingers() { return maxFingers; },
    onStart(event: Pick<TouchEvent, 'touches' | 'changedTouches'>) {
      if (maxFingers === 0) {
        startedAt = now();
        moved = false;
        starts.clear();
      }
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches.item(index);
        if (touch && !starts.has(touch.identifier)) starts.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
      maxFingers = Math.max(maxFingers, event.touches.length, starts.size);
    },
    onMove(event: Pick<TouchEvent, 'touches'>) {
      for (let index = 0; index < event.touches.length; index += 1) {
        const touch = event.touches.item(index);
        if (touch) markMoved(touch);
      }
    },
    onEnd(event: Pick<TouchEvent, 'touches' | 'changedTouches'>): TouchTapAction | null {
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches.item(index);
        if (touch) markMoved(touch);
      }
      if (event.touches.length > 0) return null;
      const elapsed = now() - startedAt;
      const action: TouchTapAction | null = !moved && elapsed <= maxMs
        ? (maxFingers >= 3 ? 'redo' : maxFingers === 2 ? 'undo' : null)
        : null;
      reset();
      return action;
    },
  };
}
