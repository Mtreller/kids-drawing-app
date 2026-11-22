import type { Point } from './drawing';

export type ObjectGesture = { distance: number; angle: number; width: number; height: number; rotation: number };
export type ViewGesture = {
  distance: number;
  angle: number;
  center: Point;
  zoom: number;
  pan: Point;
  rotation: number;
  /** Untransformed centre of the canvas on screen when the gesture started. */
  origin: Point;
  /** Twisting only starts rotating after a deliberate turn, so pinches stay level. */
  rotationUnlocked: boolean;
};
export type MultiTouch = { startedAt: number; maxPointers: number; moved: boolean; initial: Map<number, Point> };
export type MouseResize = { id: string; distance: number; width: number; height: number };
export type MouseRotate = { id: string; angle: number; rotation: number };
export type Size = { width: number; height: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
const ROTATION_UNLOCK = 14 * Math.PI / 180;
const ROTATION_SNAP = 7 * Math.PI / 180;
const PAN_MARGIN = 48;

export function normalizeRotation(angle: number) {
  const fullTurn = Math.PI * 2;
  return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

export function clampZoom(zoom: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Snap to the nearest quarter turn when close, so a twisted page settles straight. */
export function snapRotation(angle: number) {
  const quarter = Math.PI / 2;
  const nearest = Math.round(angle / quarter) * quarter;
  return Math.abs(angle - nearest) <= ROTATION_SNAP ? normalizeRotation(nearest) : normalizeRotation(angle);
}

/**
 * Keep the zoomed page reachable edge to edge. The limit grows with the real
 * on-screen size of the page (rotated bounding box), so large tablets can pan
 * all the way to every corner.
 */
export function constrainPan(nextZoom: number, nextPan: Point, displaySize?: Size | null, rotation = 0) {
  const width = displaySize?.width ?? 720;
  const height = displaySize?.height ?? 560;
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  const boundsWidth = width * cosine + height * sine;
  const boundsHeight = width * sine + height * cosine;
  const extra = nextZoom > 1.01 ? PAN_MARGIN : 0;
  const maxX = (nextZoom - 1) * boundsWidth / 2 + extra;
  const maxY = (nextZoom - 1) * boundsHeight / 2 + extra;
  // `+ 0` turns -0 into 0 so a fitted page reports a clean origin.
  return {
    x: Math.max(-maxX, Math.min(maxX, nextPan.x)) + 0,
    y: Math.max(-maxY, Math.min(maxY, nextPan.y)) + 0,
  };
}

/**
 * Pinch, pan and twist around the fingers: the part of the page that was under
 * the fingers when the gesture started stays under them.
 */
export function solveViewGesture(start: ViewGesture, current: { distance: number; angle: number; center: Point }) {
  const zoom = clampZoom(start.zoom * current.distance / start.distance);
  let twist = normalizeRotation(current.angle - start.angle);
  let rotationUnlocked = start.rotationUnlocked;
  if (!rotationUnlocked && Math.abs(twist) > ROTATION_UNLOCK) rotationUnlocked = true;
  if (!rotationUnlocked) twist = 0;
  else if (!start.rotationUnlocked) twist -= Math.sign(twist) * ROTATION_UNLOCK;
  const rotation = rotationUnlocked ? snapRotation(start.rotation + twist) : start.rotation;
  const delta = rotation - start.rotation;
  const scale = zoom / start.zoom;
  const fromOriginX = start.center.x - start.origin.x - start.pan.x;
  const fromOriginY = start.center.y - start.origin.y - start.pan.y;
  const cosine = Math.cos(delta);
  const sine = Math.sin(delta);
  const pan = {
    x: current.center.x - start.origin.x - scale * (fromOriginX * cosine - fromOriginY * sine),
    y: current.center.y - start.origin.y - scale * (fromOriginX * sine + fromOriginY * cosine),
  };
  return { zoom, rotation, pan, rotationUnlocked };
}

/** Zoom by a factor while keeping one screen point fixed (mouse wheel, trackpad pinch). */
export function zoomAroundPoint(zoom: number, nextZoom: number, pan: Point, focus: Point, origin: Point) {
  const scale = nextZoom / zoom;
  return {
    x: focus.x - origin.x - scale * (focus.x - origin.x - pan.x),
    y: focus.y - origin.y - scale * (focus.y - origin.y - pan.y),
  };
}

export function canvasPointFromClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  rotation: number,
  zoom: number,
  requireInside = false,
): Point | null {
  return canvasPointFromRect(canvasMetrics(canvas), clientX, clientY, rotation, zoom, requireInside);
}

export type CanvasMetrics = {
  centerX: number;
  centerY: number;
  clientWidth: number;
  clientHeight: number;
  width: number;
  height: number;
};

/** Read layout once per event; reuse it for every coalesced pen sample. */
export function canvasMetrics(canvas: HTMLCanvasElement): CanvasMetrics {
  const rect = canvas.getBoundingClientRect();
  return {
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
    width: canvas.width,
    height: canvas.height,
  };
}

export function canvasPointFromRect(
  metrics: CanvasMetrics,
  clientX: number,
  clientY: number,
  rotation: number,
  zoom: number,
  requireInside = false,
): Point | null {
  const visualX = clientX - metrics.centerX;
  const visualY = clientY - metrics.centerY;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const localX = (visualX * cosine + visualY * sine) / zoom + metrics.clientWidth / 2;
  const localY = (-visualX * sine + visualY * cosine) / zoom + metrics.clientHeight / 2;
  if (requireInside && (localX < 0 || localX > metrics.clientWidth || localY < 0 || localY > metrics.clientHeight)) return null;
  return {
    x: Math.max(0, Math.min(metrics.width, localX * metrics.width / Math.max(1, metrics.clientWidth))),
    y: Math.max(0, Math.min(metrics.height, localY * metrics.height / Math.max(1, metrics.clientHeight))),
  };
}
