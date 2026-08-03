import type { Tool } from '../drawing';
import { ToolIcon } from '../icons';
import { IconButton } from './Controls';

export type PanelName = 'shapes' | 'stickers' | 'brush' | 'actions' | 'library' | null;

export function TopBar({ focusMode, canUndo, canRedo, onUndo, onRedo, onFocus, onLibrary, onActions }: {
  focusMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFocus: () => void;
  onLibrary: () => void;
  onActions: () => void;
}) {
  return <header className="topbar">
    <div className="brand"><span className="brand__mark" aria-hidden="true">✦</span><span>Color Pop</span></div>
    <div className="topbar__actions">
      <IconButton icon="↶" label="Undo" disabled={!canUndo} onClick={onUndo} />
      <IconButton icon="↷" label="Redo" disabled={!canRedo} onClick={onRedo} />
      <IconButton icon="⛶" label={focusMode ? 'Exit focus mode' : 'Enter focus mode'} active={focusMode} onClick={onFocus} />
      <button className="library-button" type="button" onClick={onLibrary}><span aria-hidden="true">▦</span><b>Drawings</b></button>
      <button className="gallery-button" type="button" onClick={onActions}><span aria-hidden="true">•••</span><b>Actions</b></button>
    </div>
  </header>;
}

export function ToolDock({ tool, panel, stayInLines, onBrush, onStayInLines, onEraser, onFill, onMove, onShapes, onStickers, onReset }: {
  tool: Tool;
  panel: PanelName;
  stayInLines: boolean;
  onBrush: () => void;
  onStayInLines: () => void;
  onEraser: () => void;
  onFill: () => void;
  onMove: () => void;
  onShapes: () => void;
  onStickers: () => void;
  onReset: () => void;
}) {
  return <nav className="tool-dock" aria-label="Drawing tools">
    <IconButton icon={<ToolIcon name="brush" />} label="Choose brush" active={tool === 'brush' || panel === 'brush'} onClick={onBrush} />
    <IconButton icon={<ToolIcon name="magic" />} label="Stay inside lines" active={stayInLines} className="line-safe-tool" onClick={onStayInLines} />
    <IconButton icon={<ToolIcon name="eraser" />} label="Eraser" active={tool === 'eraser'} onClick={onEraser} />
    <IconButton icon={<ToolIcon name="fill" />} label="Fill bucket" active={tool === 'fill'} onClick={onFill} />
    <IconButton icon={<ToolIcon name="move" />} label="Move objects" active={tool === 'move'} onClick={onMove} />
    <IconButton icon={<ToolIcon name="shapes" />} label="Shapes" active={panel === 'shapes'} onClick={onShapes} />
    <IconButton icon={<ToolIcon name="sticker" />} label="Stickers" active={panel === 'stickers'} onClick={onStickers} />
    <IconButton icon={<ToolIcon name="reset" />} label="Reset page" className="reset-tool" onClick={onReset} />
  </nav>;
}
