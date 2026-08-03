import type { CSSProperties, PointerEventHandler, RefObject, WheelEventHandler } from 'react';
import type { ArtObject, Point, Tool } from '../drawing';
import { ToolIcon } from '../icons';
import { VerticalRange } from './Controls';

type Size = { width: number; height: number };

export function CanvasWorkspace({
  message, stayInLines, selectedObject, canvasRotation, zoom,
  onRotateSelected, onDeleteSelected, onRotateCanvas, onResetCanvasRotation, onResetView,
  onWheel, onStagePointerDown, onStagePointerMove, onStagePointerUp, onStagePointerCancel,
  clusterRef, sizeControlRef, opacityControlRef, brushSize, opacity, onBrushSize, onOpacity, onOpenBrush,
  canvasSize, displaySize, pan, visibleRef, fillPreviewRef, fillPreviewActive, tool, brushCursor,
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
  opacity: number;
  onBrushSize: (value: number) => void;
  onOpacity: (value: number) => void;
  onOpenBrush: () => void;
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
  return <section className="workspace" onWheel={onWheel}>
    <div className="workspace-hud">
      <div className="status-pill" role="status">{message}</div>
      {stayInLines && <div className="line-mode-badge"><ToolIcon name="magic" size={16} /><span>Stay Inside Lines</span></div>}
      {selectedObject && <div className="selection-toolbar" aria-label="Selected object controls">
        <span>{Math.round(selectedObject.width)} × {Math.round(selectedObject.height)} • {Math.round(selectedObject.rotation * 180 / Math.PI)}°</span>
        <button className="rotate-selection" type="button" onClick={onRotateSelected} aria-label="Rotate selected object 15 degrees">↻</button>
        <button className="delete-selection" type="button" onClick={onDeleteSelected} aria-label="Delete selected object">×</button>
      </div>}
      <div className="view-controls" aria-label="Canvas view controls">
        <button type="button" onClick={() => onRotateCanvas(-1)} aria-label="Rotate canvas left 90 degrees">↶<span>90°</span></button>
        <button className="rotation-reset" type="button" onClick={onResetCanvasRotation} aria-label="Reset canvas rotation">{Math.round(canvasRotation * 180 / Math.PI)}°</button>
        <button type="button" onClick={() => onRotateCanvas(1)} aria-label="Rotate canvas right 90 degrees">↷<span>90°</span></button>
        <button className="zoom-reset" type="button" onClick={onResetView} aria-label="Fit canvas to screen">Fit {Math.round(zoom * 100)}%</button>
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
        <aside className="side-controls" ref={sizeControlRef} aria-label="Brush size">
          <span className="control-icon"><ToolIcon name="brush" size={17} /></span>
          <button className="control-value" type="button" aria-label="Open brush settings" onClick={onOpenBrush}>{brushSize}<small>px</small></button>
          <VerticalRange label="Brush size" minimum={3} maximum={240} value={brushSize} onChange={onBrushSize} />
          <span className="control-label">Size</span>
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
        <aside className="side-controls side-controls--right" ref={opacityControlRef} aria-label="Brush opacity">
          <span className="control-icon"><ToolIcon name="droplet" size={17} /></span>
          <button className="control-value" type="button" aria-label="Open brush settings" onClick={onOpenBrush}>{Math.round(opacity * 100)}<small>%</small></button>
          <VerticalRange label="Brush opacity" minimum={10} maximum={100} value={opacity * 100} onChange={(value) => onOpacity(value / 100)} />
          <span className="control-label">Opacity</span>
        </aside>
      </div>
    </div>
  </section>;
}
