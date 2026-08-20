import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { BrushType } from '../brushes';
import type { Point } from '../drawing';

export type DragColor = { color: string; x: number; y: number } | null;

const isLandscapePalette = () => window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;

function nearestSwatchColor(palette: HTMLElement, clientX: number, clientY: number) {
  let closest: string | null = null;
  let closestDistance = 40;
  for (const swatch of palette.querySelectorAll<HTMLElement>('.swatch[data-color]')) {
    const rect = swatch.getBoundingClientRect();
    const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
    if (distance < closestDistance) {
      closest = swatch.dataset.color ?? null;
      closestDistance = distance;
    }
  }
  return closest;
}

function hitFromEvent(event: React.PointerEvent<HTMLElement>) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.swatch--picker')) return { kind: 'picker' as const };
  const magic = target?.closest<HTMLElement>('.magic-brush-button');
  if (magic?.dataset.brush) return { kind: 'magic' as const, brush: magic.dataset.brush as BrushType };
  const swatch = target?.closest<HTMLElement>('.swatch[data-color]');
  if (swatch?.dataset.color) return { kind: 'swatch' as const, color: swatch.dataset.color };
  return { kind: 'bar' as const, color: nearestSwatchColor(event.currentTarget, event.clientX, event.clientY) };
}

export function useColorDropGesture({
  canvasRef, pointFromClient, previewColorDrop, clearFillPreview, fillAt,
  setColor, onSelectBrush, activateFillTool, closePanels, stopDrawing, setDragColor, setMessage,
  clearBrushCursor, haptic, notify,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
  pointFromClient: (canvas: HTMLCanvasElement, clientX: number, clientY: number, requireInside?: boolean) => Point | null;
  previewColorDrop: (clientX: number, clientY: number, color: string) => void;
  clearFillPreview: () => void;
  fillAt: (point: Point, color: string) => void;
  setColor: (color: string) => void;
  onSelectBrush: (brush: BrushType) => void;
  activateFillTool: () => void;
  closePanels: () => void;
  stopDrawing: () => void;
  setDragColor: (drag: DragColor) => void;
  setMessage: (message: string) => void;
  clearBrushCursor: () => void;
  haptic: (pattern?: number | number[]) => void;
  notify: (message: string) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const hit = hitFromEvent(event);
    if (hit.kind === 'picker') return;

    cleanupRef.current?.();
    const { pointerId, pointerType, clientX: startX, clientY: startY } = event;
    const verticalPalette = isLandscapePalette();
    const palette = event.currentTarget;
    const scroller = palette.querySelector<HTMLElement>('.palette__scroller');
    const fingerLift = pointerType === 'touch' ? 58 : 0;
    const fillColor = hit.kind === 'swatch' ? hit.color : hit.kind === 'bar' ? hit.color : null;
    let mode: 'undecided' | 'scroll' | 'fill' = 'undecided';
    let lastX = startX;
    let lastY = startY;
    let velocity = 0;
    let coast = 0;

    const aim = (x: number, y: number) => verticalPalette
      ? { x: x - fingerLift, y }
      : { x, y: y - fingerLift };

    event.preventDefault();
    try { palette.setPointerCapture(pointerId); } catch { /* Window listeners still keep the drag reliable. */ }
    clearBrushCursor();

    const scrollBy = (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!scroller) return;
      const delta = verticalPalette ? toY - fromY : toX - fromX;
      if (verticalPalette) scroller.scrollTop -= delta;
      else scroller.scrollLeft -= delta;
      velocity = delta;
    };

    const activateFill = (color: string) => {
      if (mode === 'fill' || !color) return;
      mode = 'fill';
      setColor(color);
      activateFillTool();
      closePanels();
      stopDrawing();
      haptic([8, 22, 8]);
      const point = aim(lastX, lastY);
      setDragColor({ color, x: point.x, y: point.y });
      setMessage('Drag onto a section, then let go to fill');
      previewColorDrop(point.x, point.y, color);
    };

    const cleanup = () => {
      cancelAnimationFrame(coast);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
    };

    const finish = () => {
      cleanup();
      cleanupRef.current = () => cancelAnimationFrame(coast);
    };

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const previousX = lastX;
      const previousY = lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const deltaX = lastX - startX;
      const deltaY = lastY - startY;
      const along = verticalPalette ? Math.abs(deltaY) : Math.abs(deltaX);
      const across = verticalPalette ? Math.abs(deltaX) : Math.abs(deltaY);
      const towardCanvas = verticalPalette ? deltaX < -6 : deltaY < -6;

      if (mode === 'undecided') {
        const mouseDrag = pointerType !== 'touch' && Math.hypot(deltaX, deltaY) > 4;
        const liftToFill = towardCanvas && across >= 6 && across >= along * .4;
        if (fillColor && (liftToFill || mouseDrag)) activateFill(fillColor);
        else if (along >= 3) mode = 'scroll';
      }

      if (mode === 'scroll') {
        if (moveEvent.cancelable) moveEvent.preventDefault();
        scrollBy(previousX, previousY, lastX, lastY);
        return;
      }
      if (mode === 'fill' && fillColor) {
        if (moveEvent.cancelable) moveEvent.preventDefault();
        const point = aim(lastX, lastY);
        setDragColor({ color: fillColor, x: point.x, y: point.y });
        previewColorDrop(point.x, point.y, fillColor);
      }
    };

    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      const currentMode = mode;
      const currentVelocity = velocity;
      finish();
      setDragColor(null);
      clearFillPreview();
      if (currentMode === 'scroll') {
        velocity = currentVelocity;
        const glide = () => {
          velocity *= 0.94;
          if (!scroller || Math.abs(velocity) < 0.45) {
            cleanupRef.current = null;
            return;
          }
          if (verticalPalette) scroller.scrollTop -= velocity;
          else scroller.scrollLeft -= velocity;
          coast = requestAnimationFrame(glide);
        };
        coast = requestAnimationFrame(glide);
        cleanupRef.current = () => cancelAnimationFrame(coast);
        return;
      }
      if (currentMode !== 'fill') {
        if (Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) > 8) return;
        if (hit.kind === 'magic') onSelectBrush(hit.brush);
        else if (fillColor) { setColor(fillColor); haptic(5); }
        return;
      }
      const canvas = canvasRef.current;
      const point = aim(upEvent.clientX, upEvent.clientY);
      const dropPoint = canvas ? pointFromClient(canvas, point.x, point.y, true) : null;
      if (dropPoint && fillColor) fillAt(dropPoint, fillColor);
      else notify('Drop the color inside the canvas');
    };

    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      finish();
      cleanupRef.current = null;
      setDragColor(null);
      clearFillPreview();
    };

    cleanupRef.current = () => {
      cleanup();
      cleanupRef.current = null;
    };
    document.addEventListener('pointermove', move, { capture: true, passive: false });
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  }, [
    activateFillTool, canvasRef, clearBrushCursor, clearFillPreview, closePanels, fillAt,
    haptic, notify, onSelectBrush, pointFromClient, previewColorDrop, setColor, setDragColor, setMessage, stopDrawing,
  ]);
}
