import type { Point } from './drawing';

export type ObjectGesture = { distance: number; angle: number; width: number; height: number; rotation: number };
export type ViewGesture = { distance: number; angle: number; center: Point; zoom: number; pan: Point; rotation: number };
export type MultiTouch = { startedAt: number; maxPointers: number; moved: boolean; initial: Map<number, Point> };
export type MouseResize = { id: string; distance: number; width: number; height: number };
export type MouseRotate = { id: string; angle: number; rotation: number };

export function normalizeRotation(angle: number) {
  const fullTurn = Math.PI * 2;
  return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

export function constrainPan(nextZoom: number, nextPan: Point) {
  const maxX = (nextZoom - 1) * 360;
  const maxY = (nextZoom - 1) * 280;
  return {
    x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
    y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
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
  const rect = canvas.getBoundingClientRect();
  const visualX = clientX - (rect.left + rect.width / 2);
  const visualY = clientY - (rect.top + rect.height / 2);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const localX = (visualX * cosine + visualY * sine) / zoom + canvas.clientWidth / 2;
  const localY = (-visualX * sine + visualY * cosine) / zoom + canvas.clientHeight / 2;
  if (requireInside && (localX < 0 || localX > canvas.clientWidth || localY < 0 || localY > canvas.clientHeight)) return null;
  return {
    x: Math.max(0, Math.min(canvas.width, localX * canvas.width / Math.max(1, canvas.clientWidth))),
    y: Math.max(0, Math.min(canvas.height, localY * canvas.height / Math.max(1, canvas.clientHeight))),
  };
}
