import type { CSSProperties, PointerEventHandler, RefObject, WheelEventHandler } from 'react';
import { useEffect, useState } from 'react';
import type { ArtObject, Point, Tool } from '../drawing';
import { ToolIcon } from '../icons';
import { VerticalRange } from './Controls';

type Size = { width: number; height: number };

export function CanvasWorkspace({
  message, stayInLines, selectedObject, canvasRotation, zoom,
  onRotateSelected, onDeleteSelected, onRotateCanvas, onResetCanvasRotation, onResetView,
  onWheel, onStagePointerDown, onStagePointerMove, onStagePointerUp, onStagePointerCancel,
  clusterRef, sizeControlRef, opacityControlRef, brushSize, brushMinimum, brushMaximum, opacity, onBrushSize, onOpacity, onOpenBrush,
  drawingActive, canvasSize, displaySize, pan, visibleRef, fillPreviewRef, fillPreviewActive, tool, brushCursor,
  onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp, onCanvasPointerCancel,
  onCanvasPointerEnter, onCanvasPointerLeave,
}: {
  message: string;
  stayInLines: boolean;
  selectedObject: ArtObject | null;
  canvasRotation: number;
  zoom: number;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onRotateCanvas: (quarterTurns: number) => void;
  onResetCanvasRotation: () => void;
  onResetView: () => void;
  onWheel: WheelEventHandler<HTMLElement>;
  onStagePointerDown: PointerEventHandler<HTMLDivElement>;
  onStagePointerMove: PointerEventHandler<HTMLDivElement>;
  onStagePointerUp: PointerEventHandler<HTMLDivElement>;
  onStagePointerCancel: PointerEventHandler<HTMLDivElement>;
  clusterRef: RefObject<HTMLDivElement>;
  sizeControlRef: RefObject<HTMLElement>;
  opacityControlRef: RefObject<HTMLElement>;
  brushSize: number;
  brushMinimum: number;
  brushMaximum: number;
  opacity: number;
  onBrushSize: (value: number) => void;
  onOpacity: (value: number) => void;
  onOpenBrush: () => void;
  drawingActive: boolean;
  canvasSize: Size;
  displaySize: Size | null;
  pan: Point;
  visibleRef: RefObject<HTMLCanvasElement>;
  fillPreviewRef: RefObject<HTMLCanvasElement>;
  fillPreviewActive: boolean;
  tool: Tool;
  brushCursor: Point | null;
  onCanvasPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerUp: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerCancel: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerEnter: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerLeave: PointerEventHandler<HTMLCanvasElement>;
}) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);

  useEffect(() => {
    if (!drawingActive) return;
    setSizeOpen(false);
    setOpacityOpen(false);
  }, [drawingActive]);

  return <section className="workspace" onWheel={onWheel}>
    <div className="workspace-hud">
      <div className="status-pill" role="status">{message}</div>
      {stayInLines && <div className="line-mode-badge"><ToolIcon name="magic" size={16} /><span>Stay Inside Lines</span></div>}
      {selectedObject && <div className="selection-toolbar" aria-label="Selected object controls">
        <span>{Math.round(selectedObject.width)} × {Math.round(selectedObject.height)} • {Math.round(selectedObject.rotation * 180 / Math.PI)}°</span>
        <button className="rotate-selection" type="button" onClick={onRotateSelected} aria-label="Rotate selected object 15 degrees"><ToolIcon name="rotateRight" size={16} /></button>
        <button className="delete-selection" type="button" onClick={onDeleteSelected} aria-label="Delete selected object"><ToolIcon name="close" size={16} /></button>
      </div>}
      <div className="view-controls" aria-label="Canvas view controls">
        <button type="button" onClick={() => onRotateCanvas(-1)} aria-label="Rotate canvas left 90 degrees"><ToolIcon name="rotateLeft" size={16} /><span>90°</span></button>
        <button className="rotation-reset" type="button" onClick={onResetCanvasRotation} aria-label="Reset canvas rotation">{Math.round(canvasRotation * 180 / Math.PI)}°</button>
        <button type="button" onClick={() => onRotateCanvas(1)} aria-label="Rotate canvas right 90 degrees"><ToolIcon name="rotateRight" size={16} /><span>90°</span></button>
        <button className="zoom-reset" type="button" onClick={onResetView} aria-label="Fit canvas to screen"><ToolIcon name="fit" size={15} />{Math.round(zoom * 100)}%</button>
      </div>
    </div>
    <div
      className="canvas-stage"
      onPointerDownCapture={onStagePointerDown}
      onPointerMoveCapture={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerCancel}
    >
      <div className="canvas-cluster" ref={clusterRef}>
        <aside className={`side-controls${sizeOpen ? ' is-open' : ' is-collapsed'}`} ref={sizeControlRef} aria-label="Brush size">
          <button
            className="side-controls__toggle"
            type="button"
            aria-expanded={sizeOpen}
            aria-label={sizeOpen ? 'Hide brush size' : 'Show brush size'}
            onClick={() => setSizeOpen((open) => !open)}
          ><ToolIcon name="chevronRight" size={16} /></button>
          <div className="side-controls__body">
            <span className="control-icon"><ToolIcon name="brush" size={17} /></span>
            <button className="control-value" type="button" aria-label="Open brush settings" onClick={onOpenBrush}>{brushSize}<small>px</small></button>
            <VerticalRange label="Brush size" minimum={brushMinimum} maximum={brushMaximum} value={brushSize} onChange={onBrushSize} />
            <span className="control-label">Size</span>
          </div>
        </aside>
        <div className="canvas-wrap" style={{
          '--page-ratio': canvasSize.width / canvasSize.height,
          width: displaySize?.width,
          height: displaySize?.height,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${canvasRotation}rad)`,
        } as CSSProperties}>
          <canvas
            ref={visibleRef}
            width={canvasSize.width}
            height={canvasSize.height}
            aria-label="Drawing canvas"
            className={tool === 'move' ? 'is-move-tool' : ''}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerCancel}
            onPointerEnter={onCanvasPointerEnter}
            onPointerLeave={onCanvasPointerLeave}
            onDoubleClick={onResetView}
            onContextMenu={(event) => event.preventDefault()}
          />
          <canvas ref={fillPreviewRef} className={`fill-preview-canvas${fillPreviewActive ? ' is-active' : ''}`} width={canvasSize.width} height={canvasSize.height} aria-hidden="true" />
          {brushCursor && (tool === 'brush' || tool === 'eraser') && <span
            className={`brush-size-outline${tool === 'eraser' ? ' is-eraser' : ''}`}
            style={{
              left: `${brushCursor.x / canvasSize.width * 100}%`,
              top: `${brushCursor.y / canvasSize.height * 100}%`,
              width: Math.max(5, brushSize * (displaySize?.width ?? canvasSize.width) / canvasSize.width),
              height: Math.max(5, brushSize * (displaySize?.width ?? canvasSize.width) / canvasSize.width),
            }}
            aria-hidden="true"
          />}
        </div>
        <aside className={`side-controls side-controls--right${opacityOpen ? ' is-open' : ' is-collapsed'}`} ref={opacityControlRef} aria-label="Brush opacity">
          <button
            className="side-controls__toggle"
            type="button"
            aria-expanded={opacityOpen}
            aria-label={opacityOpen ? 'Hide brush opacity' : 'Show brush opacity'}
            onClick={() => setOpacityOpen((open) => !open)}
          ><ToolIcon name="chevronRight" size={16} /></button>
          <div className="side-controls__body">
            <span className="control-icon"><ToolIcon name="droplet" size={17} /></span>
            <button className="control-value" type="button" aria-label="Open brush settings" onClick={onOpenBrush}>{Math.round(opacity * 100)}<small>%</small></button>
            <VerticalRange label="Brush opacity" minimum={10} maximum={100} value={opacity * 100} onChange={(value) => onOpacity(value / 100)} />
            <span className="control-label">Opacity</span>
          </div>
        </aside>
      </div>
    </div>
  </section>;
}
