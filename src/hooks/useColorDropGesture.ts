import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../drawing';

export type DragColor = { color: string; x: number; y: number } | null;

const isLandscapePalette = () => window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;

export function useColorDropGesture({
  canvasRef, pointFromClient, previewColorDrop, clearFillPreview, fillAt,
  setColor, activateFillTool, closePanels, stopDrawing, setDragColor, setMessage,
  clearBrushCursor, haptic, notify,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
  pointFromClient: (canvas: HTMLCanvasElement, clientX: number, clientY: number, requireInside?: boolean) => Point | null;
  previewColorDrop: (clientX: number, clientY: number, color: string) => void;
  clearFillPreview: () => void;
  fillAt: (point: Point, color: string) => void;
  setColor: (color: string) => void;
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

  return useCallback((event: React.PointerEvent, swatchColor: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cleanupRef.current?.();
    const { pointerId, pointerType, clientX: startX, clientY: startY } = event;
    const verticalPalette = isLandscapePalette();
    const source = event.currentTarget as HTMLElement;
    const fingerLift = pointerType === 'touch' ? 58 : 0;
    let filling = false;
    let scrolling = false;
    let trackingFill = false;
    let lastX = startX;
    let lastY = startY;

    const aim = (x: number, y: number) => verticalPalette
      ? { x: x - fingerLift, y }
      : { x, y: y - fingerLift };

    clearBrushCursor();

    const listenForFillMoves = () => {
      if (trackingFill) return;
      trackingFill = true;
      document.removeEventListener('pointermove', move, true);
      document.addEventListener('pointermove', move, { capture: true, passive: false });
    };

    const activateFill = () => {
      if (filling || scrolling) return;
      filling = true;
      listenForFillMoves();
      try { source.setPointerCapture(pointerId); } catch { /* Window listeners still keep the drag reliable. */ }
      setColor(swatchColor);
      activateFillTool();
      closePanels();
      stopDrawing();
      haptic([8, 22, 8]);
      const point = aim(lastX, lastY);
      setDragColor({ color: swatchColor, x: point.x, y: point.y });
      setMessage('Drag onto a section, then let go to fill');
      previewColorDrop(point.x, point.y, swatchColor);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      cleanupRef.current = null;
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const deltaX = lastX - startX;
      const deltaY = lastY - startY;
      const along = verticalPalette ? Math.abs(deltaY) : Math.abs(deltaX);
      const across = verticalPalette ? Math.abs(deltaX) : Math.abs(deltaY);
      const towardCanvas = verticalPalette ? deltaX < -4 : deltaY < -4;

      if (!filling && !scrolling) {
        if (pointerType !== 'touch' && Math.hypot(deltaX, deltaY) > 4) activateFill();
        else if (towardCanvas && across >= 6 && across > along) activateFill();
        else if (pointerType === 'touch' && along > 4 && along >= across) scrolling = true;
      }
      if (scrolling) return;
      if (filling) {
        if (!moveEvent.cancelable) return;
        moveEvent.preventDefault();
        const point = aim(lastX, lastY);
        setDragColor({ color: swatchColor, x: point.x, y: point.y });
        previewColorDrop(point.x, point.y, swatchColor);
      }
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      setDragColor(null);
      clearFillPreview();
      const along = verticalPalette
        ? Math.abs(upEvent.clientY - startY)
        : Math.abs(upEvent.clientX - startX);
      if (scrolling || (!filling && along > 8)) return;
      if (!filling) { setColor(swatchColor); haptic(5); return; }
      const canvas = canvasRef.current;
      const point = aim(upEvent.clientX, upEvent.clientY);
      const dropPoint = canvas ? pointFromClient(canvas, point.x, point.y, true) : null;
      if (dropPoint) fillAt(dropPoint, swatchColor);
      else notify('Drop the color inside the canvas');
    };
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
      setDragColor(null);
      clearFillPreview();
    };
    cleanupRef.current = cleanup;
    document.addEventListener('pointermove', move, { capture: true, passive: true });
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  }, [
    activateFillTool, canvasRef, clearBrushCursor, clearFillPreview, closePanels, fillAt,
    haptic, notify, pointFromClient, previewColorDrop, setColor, setDragColor, setMessage, stopDrawing,
  ]);
}
