import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../drawing';

export type DragColor = { color: string; x: number; y: number } | null;

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
    const verticalPalette = window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
    const source = event.currentTarget as HTMLElement;
    const paletteScroller = source.closest<HTMLElement>('.palette__scroller');
    let filling = false;
    let scrolling = false;
    let lastX = startX;
    let lastY = startY;
    if (verticalPalette && pointerType === 'touch') event.preventDefault();
    try { source.setPointerCapture(pointerId); } catch { /* Window listeners still keep the drag reliable. */ }
    clearBrushCursor();

    const activateFill = () => {
      if (filling || scrolling) return;
      filling = true;
      setColor(swatchColor);
      activateFillTool();
      closePanels();
      stopDrawing();
      haptic([8, 28, 8]);
      const fingerLift = pointerType === 'touch' ? 48 : 0;
      setDragColor({ color: swatchColor, x: lastX - (verticalPalette ? fingerLift : 0), y: lastY - (verticalPalette ? 0 : fingerLift) });
      setMessage('ColorDrop ready • drag to a section and release');
    };

    const holdTimer = window.setTimeout(activateFill, pointerType === 'touch' ? 340 : 420);
    const clearHold = () => window.clearTimeout(holdTimer);
    const cleanup = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      clearHold();
      cleanupRef.current = null;
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const previousY = lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);
      const paletteScroll = verticalPalette
        ? Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        : Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
      if (!filling && !scrolling && pointerType === 'touch' && paletteScroll) {
        scrolling = true;
        clearHold();
        if (verticalPalette && paletteScroller) paletteScroller.scrollTop -= deltaY;
      } else if (scrolling && verticalPalette && paletteScroller) {
        paletteScroller.scrollTop -= moveEvent.clientY - previousY;
      }
      if (scrolling) {
        if (verticalPalette) moveEvent.preventDefault();
        return;
      }
      const draggedTowardCanvas = verticalPalette
        ? deltaX < -8 && Math.abs(deltaX) > Math.abs(deltaY) * .55
        : deltaY < -8 && Math.abs(deltaY) > Math.abs(deltaX) * .55;
      if (!filling && (pointerType !== 'touch' ? distance > 6 : draggedTowardCanvas)) activateFill();
      if (filling) {
        moveEvent.preventDefault();
        const fingerLift = pointerType === 'touch' ? 48 : 0;
        setDragColor({ color: swatchColor, x: moveEvent.clientX - (verticalPalette ? fingerLift : 0), y: moveEvent.clientY - (verticalPalette ? 0 : fingerLift) });
        previewColorDrop(moveEvent.clientX, moveEvent.clientY, swatchColor);
      }
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      setDragColor(null);
      clearFillPreview();
      if (scrolling) return;
      if (!filling) { setColor(swatchColor); haptic(5); return; }
      const canvas = canvasRef.current;
      const dropPoint = canvas ? pointFromClient(canvas, upEvent.clientX, upEvent.clientY, true) : null;
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
    document.addEventListener('pointermove', move, { capture: true, passive: false });
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  }, [
    activateFillTool, canvasRef, clearBrushCursor, clearFillPreview, closePanels, fillAt,
    haptic, notify, pointFromClient, previewColorDrop, setColor, setDragColor, setMessage, stopDrawing,
  ]);
}
