import { type CSSProperties, useEffect, useRef } from 'react';
import { brushPresets, renderBrushStroke, type BrushType } from '../brushes';
import { ToolIcon } from '../icons';
import { LogRangeInput } from './Controls';
import type { PanelName } from './Toolbars';

const stickers = [
  '⭐', '❤️', '🌈', '☀️', '🌙', '☁️', '⚡', '❄️',
  '🦋', '🐞', '🐝', '🐠', '🐶', '🐱', '🐰', '🐻', '🦁', '🐯', '🦖', '🐙', '🦄', '🐸',
  '🌸', '🌻', '🌳', '🍄', '🍎', '🍓', '🍌', '🍦', '🍩', '🎂',
  '🚀', '🚗', '🚂', '⛵', '🎈', '🎁', '👑', '💎',
];
const kidShapes = [
  { id: 'circle' as const, icon: '●' },
  { id: 'rectangle' as const, icon: '■' },
  { id: 'star' as const, icon: '★' },
];
const rangeStyle = (value: number, minimum: number, maximum: number) => ({
  '--range-progress': `${(value - minimum) / (maximum - minimum) * 100}%`,
} as CSSProperties);

function BrushStrokePreview({ type, color, size, alpha, compact = false }: { type: BrushType; color: string; size: number; alpha: number; compact?: boolean }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderBrushStroke(context, {
      from: { x: 34, y: canvas.height / 2 + 5 },
      to: { x: canvas.width - 34, y: canvas.height / 2 - 5 },
      color,
      size: compact ? 22 : Math.max(10, Math.min(54, size * .42)),
      alpha,
      type,
    });
  }, [alpha, color, compact, size, type]);
  return <canvas ref={previewRef} width={compact ? 160 : 480} height={compact ? 64 : 76} aria-hidden={compact || undefined} aria-label={compact ? undefined : `${type} brush preview`} />;
}

export function FloatingPanels({
  panel, brushType, color, brushSize, brushMinimum, brushMaximum, opacity, flow, smoothing,
  stayInLines, tolerance, focusMode, leftHanded, pencilOnly, penSeen, kidMode, soundOn,
  onClose, onSelectBrush, onToggleStayInLines, onBrushSize, onOpacity, onFlow, onSmoothing,
  onAddShape, onAddSticker, onUpload, onSave, onDownload, onResetPage, onClearArt, onToggleFocus,
  onToggleHanded, onTolerance, onTogglePencil, onToggleKidMode, onToggleSound,
}: {
  panel: PanelName;
  brushType: BrushType;
  color: string;
  brushSize: number;
  brushMinimum: number;
  brushMaximum: number;
  opacity: number;
  flow: number;
  smoothing: number;
  stayInLines: boolean;
  tolerance: number;
  focusMode: boolean;
  leftHanded: boolean;
  pencilOnly: boolean;
  penSeen: boolean;
  kidMode: boolean;
  soundOn: boolean;
  onClose: () => void;
  onSelectBrush: (brush: BrushType) => void;
  onToggleStayInLines: () => void;
  onBrushSize: (value: number) => void;
  onOpacity: (value: number) => void;
  onFlow: (value: number) => void;
  onSmoothing: (value: number) => void;
  onAddShape: (shape: 'rectangle' | 'circle' | 'star') => void;
  onAddSticker: (sticker: string) => void;
  onUpload: () => void;
  onSave: () => void;
  onDownload: () => void;
  onResetPage: () => void;
  onClearArt: () => void;
  onToggleFocus: () => void;
  onToggleHanded: () => void;
  onTolerance: (value: number) => void;
  onTogglePencil: () => void;
  onToggleKidMode: () => void;
  onToggleSound: () => void;
}) {
  return <>
    {panel === 'brush' && kidMode && <section className="popover brush-popover brush-popover--kid" role="dialog" aria-label="Pick a brush">
      <div className="kid-brush-grid">
        {brushPresets.map((brush) => <button
          key={brush.id}
          type="button"
          className={`kid-brush${brushType === brush.id ? ' is-selected' : ''}`}
          aria-pressed={brushType === brush.id}
          aria-label={`${brush.name} brush`}
          onClick={() => onSelectBrush(brush.id)}
        >
          <BrushStrokePreview type={brush.id} color={color} size={70} alpha={1} compact />
          <span>{brush.name}</span>
        </button>)}
      </div>
    </section>}
    {panel === 'brush' && !kidMode && <section className="popover brush-popover" role="dialog" aria-label="Brush settings">
      <header><div><strong>Brush studio</strong><small>Pick a favorite or paint with magic</small></div><button type="button" aria-label="Close brush settings" onClick={onClose}><ToolIcon name="close" size={18} /></button></header>
      <div className="brush-library" aria-label="Brush types">
        {(['Favorites', 'Paint & texture', 'Magic'] as const).map((group) => <section className="brush-group" key={group}>
          <h3>{group}</h3>
          <div className="brush-grid">
            {brushPresets.filter((brush) => brush.group === group).map((brush) => <button
              key={brush.id}
              className={`brush-card${brushType === brush.id ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={brushType === brush.id}
              onClick={() => onSelectBrush(brush.id)}
            >
              <span className="brush-card__icon" aria-hidden="true">{brush.icon}</span>
              <span><b>{brush.name}</b><small>{brush.description}</small></span>
            </button>)}
          </div>
        </section>)}
      </div>
      <button className={`line-mode-setting${stayInLines ? ' is-on' : ''}`} type="button" aria-pressed={stayInLines} onClick={onToggleStayInLines}>
        <ToolIcon name="magic" size={23} /><span><b>Stay Inside Lines</b><small>Paint only inside the section you touch</small></span><em>{stayInLines ? 'On' : 'Off'}</em>
      </button>
      <div className="brush-preview"><BrushStrokePreview type={brushType} color={color} size={brushSize} alpha={Math.max(.12, opacity * flow)} /></div>
      <label><span><b>Size</b><em>{brushSize}px</em></span><LogRangeInput className="polished-range" label="Brush size" minimum={brushMinimum} maximum={brushMaximum} value={brushSize} onChange={onBrushSize} /></label>
      <label><span><b>Opacity</b><em>{Math.round(opacity * 100)}%</em></span><input className="polished-range" style={rangeStyle(opacity * 100, 10, 100)} type="range" min="10" max="100" value={opacity * 100} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /></label>
      <label><span><b>Flow</b><em>{Math.round(flow * 100)}%</em></span><input className="polished-range" style={rangeStyle(flow * 100, 5, 100)} type="range" min="5" max="100" value={flow * 100} onChange={(event) => onFlow(Number(event.target.value) / 100)} /></label>
      <label><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input className="polished-range" style={rangeStyle(smoothing * 100, 0, 90)} type="range" min="0" max="90" value={smoothing * 100} onChange={(event) => onSmoothing(Number(event.target.value) / 100)} /></label>
    </section>}

    {panel === 'shapes' && <div className="popover shapes-popover">
      <button onClick={() => onAddShape('rectangle')}>▰<span>Rectangle</span></button>
      <button onClick={() => onAddShape('circle')}>●<span>Circle</span></button>
      <button onClick={() => onAddShape('star')}>★<span>Star</span></button>
    </div>}
    {panel === 'stickers' && <div className={`popover sticker-popover${kidMode ? ' sticker-popover--kid' : ''}`} role="dialog" aria-label="Stickers">
      {kidMode && <div className="sticker-shapes" style={{ color }}>
        {kidShapes.map((shape) => <button key={shape.id} type="button" aria-label={`${shape.id} shape`} onClick={() => onAddShape(shape.id)}>{shape.icon}</button>)}
      </div>}
      <div className="sticker-grid">{stickers.map((item) => <button key={item} type="button" aria-label={`${item} sticker`} onClick={() => onAddSticker(item)}>{item}</button>)}</div>
    </div>}
    {panel === 'actions' && <div className="popover actions-popover" role="dialog" aria-label={kidMode ? 'Grown-ups menu' : 'Actions'}>
      {kidMode && <p className="actions-popover__title">Grown-ups</p>}
      <button type="button" onClick={onUpload}><ToolIcon name="upload" size={21} /> <span>Upload picture</span></button>
      <button type="button" onClick={onSave}><ToolIcon name="save" size={21} /> <span>Save to my drawings</span></button>
      <button type="button" onClick={onDownload}><ToolIcon name="download" size={21} /> <span>Download PNG</span></button>
      <button type="button" onClick={onToggleStayInLines}><ToolIcon name="magic" size={21} /> <span>{stayInLines ? 'Free drawing mode' : 'Stay inside lines'}</span></button>
      <button type="button" onClick={onResetPage}><ToolIcon name="reset" size={21} /> <span>Reset page</span></button>
      <button type="button" onClick={onClearArt}><ToolIcon name="newCanvas" size={21} /> <span>New canvas</span></button>
      <button type="button" onClick={onToggleFocus}><ToolIcon name="focus" size={21} /> <span>{focusMode ? 'Exit focus mode' : 'Focus mode'}</span></button>
      <button type="button" onClick={onToggleHanded}><ToolIcon name="handedness" size={21} /> <span>{leftHanded ? 'Right-handed layout' : 'Left-handed layout'}</span></button>
      <button type="button" aria-pressed={pencilOnly} onClick={onTogglePencil}><ToolIcon name="brush" size={21} /> <span>{pencilOnly ? 'Let fingers draw too' : penSeen ? 'Draw with Pencil only' : 'Stylus only (palm rest)'}</span></button>
      <button type="button" aria-pressed={!kidMode} onClick={onToggleKidMode}><span aria-hidden="true" className="actions-emoji">{kidMode ? '🎛️' : '🧸'}</span> <span>{kidMode ? 'Show all controls' : 'Little kids mode'}</span></button>
      <button type="button" aria-pressed={soundOn} onClick={onToggleSound}><span aria-hidden="true" className="actions-emoji">{soundOn ? '🔇' : '🔊'}</span> <span>{soundOn ? 'Turn sounds off' : 'Turn sounds on'}</span></button>
      <label>Fill tolerance <b>{tolerance}</b><input type="range" min="5" max="80" value={tolerance} onChange={(event) => onTolerance(Number(event.target.value))} /></label>
      <div className="input-hints"><span>✨ Stay Inside Lines locks paint to one section</span><span>🎨 Drag a color onto the drawing to fill</span><span>✌️ Pinch to zoom • twist to rotate • 2-finger tap undo</span>{pencilOnly && <span>✏️ Pencil draws • fingers zoom and pan</span>}<span>🖱 Ctrl-wheel zoom • Space-drag pan</span></div>
    </div>}
  </>;
}
