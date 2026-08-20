import { useEffect, useRef } from 'react';
import { brushPresets, renderBrushStroke, type BrushType } from '../brushes';
import type { Tool } from '../drawing';
import { ToolIcon } from '../icons';

export const colors = [
  '#ff385d', '#ff6b6b', '#ff9f43', '#ffc93c', '#f7e967', '#4fdd89', '#21b66f',
  '#38c9d8', '#3199f4', '#2667ff', '#755cff', '#a855f7', '#df4ec8', '#ff65a3',
  '#f3b78b', '#b9784c', '#704332', '#ffffff', '#aab2bd', '#4b5260', '#171823',
];

const magicBrushes = brushPresets.filter((brush) => brush.group === 'Magic');

function MagicBrushPreview({ type, color }: { type: BrushType; color: string }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderBrushStroke(context, {
      from: { x: 9, y: 39 }, to: { x: 45, y: 15 }, color, size: 20, alpha: 1, type,
    });
  }, [color, type]);
  return <canvas ref={previewRef} width="54" height="54" aria-hidden="true" />;
}

export function Palette({ tool, brushType, color, onBrush, onPalettePointerDown, onCustomColor }: {
  tool: Tool;
  brushType: BrushType;
  color: string;
  onBrush: (brush: BrushType) => void;
  onPalettePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onCustomColor: (color: string) => void;
}) {
  return <footer className="palette" aria-label="Colors and magic brushes" onPointerDown={onPalettePointerDown}>
    <div className="palette__scroller">
      {magicBrushes.map((brush) => <button
        key={brush.id}
        type="button"
        data-brush={brush.id}
        className={`magic-brush-button${tool === 'brush' && brushType === brush.id ? ' is-selected' : ''}`}
        aria-label={`Select ${brush.name} brush`}
        title={`${brush.name} brush`}
        onClick={() => onBrush(brush.id)}
      ><MagicBrushPreview type={brush.id} color={color} /></button>)}
      <span className="magic-brush-divider" aria-hidden="true" />
      {colors.map((swatchColor) => <button
        key={swatchColor}
        type="button"
        data-color={swatchColor}
        className={`swatch${color === swatchColor ? ' is-selected' : ''}`}
        style={{ backgroundColor: swatchColor }}
        aria-label={`Select or drag color ${swatchColor}`}
      />)}
      <label className="swatch swatch--picker" aria-label="Choose a custom color"><ToolIcon name="plus" size={18} /><input type="color" value={color} onChange={(event) => onCustomColor(event.target.value)} /></label>
    </div>
  </footer>;
}
