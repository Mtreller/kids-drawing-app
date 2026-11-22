import type { CSSProperties } from 'react';
import type { Tool } from '../drawing';
import { ToolIcon } from '../icons';
import { IconButton } from './Controls';
import { GrownUpHold } from './GrownUpHold';

export type PanelName = 'shapes' | 'stickers' | 'brush' | 'actions' | 'library' | null;

export function TopBar({
  kidMode, focusMode, canUndo, canRedo, profileName, profileEmoji, profileColor,
  onUndo, onRedo, onFocus, onLibrary, onActions, onProfile, onGrownUpHint, onDone,
}: {
  kidMode: boolean;
  focusMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  profileName: string;
  profileEmoji: string;
  profileColor: string;
  onUndo: () => void;
  onRedo: () => void;
  onFocus: () => void;
  onLibrary: () => void;
  onActions: () => void;
  onProfile: () => void;
  onGrownUpHint: () => void;
  onDone: () => void;
}) {
  return <header className="topbar">
    <div className="brand"><span className="brand__mark" aria-hidden="true">✦</span><span>Color Pop</span></div>
    <div className="topbar__actions">
      {!kidMode && <>
        <IconButton icon={<ToolIcon name="undo" />} label="Undo" disabled={!canUndo} onClick={onUndo} />
        <IconButton icon={<ToolIcon name="redo" />} label="Redo" disabled={!canRedo} onClick={onRedo} />
      </>}
      <IconButton icon={<ToolIcon name="focus" />} label={focusMode ? 'Exit focus mode' : 'Enter focus mode'} active={focusMode} onClick={onFocus} />
      <button className="library-button" type="button" onClick={onLibrary} aria-label="Pictures to color and my drawings">
        <span className="library-button__emoji" aria-hidden="true">🖼️</span><b>Pictures</b>
      </button>
      <button className="profile-button" type="button" onClick={onProfile} aria-label={`Switch artist, currently ${profileName}`}>
        <span className="profile-avatar profile-avatar--bar" style={{ background: profileColor }}>{profileEmoji}</span>
        <b>{profileName}</b>
      </button>
      {kidMode && <button className="done-button" type="button" onClick={onDone} aria-label="I'm done, save my picture"><span aria-hidden="true">⭐</span><b>Done</b></button>}
      {kidMode
        ? <GrownUpHold className="gallery-button grown-up-button" label="Grown-ups menu" onConfirm={onActions} onTapHint={onGrownUpHint}>
          <span aria-hidden="true">🔒</span><b>Grown-ups</b>
        </GrownUpHold>
        : <button className="gallery-button" type="button" onClick={onActions}><ToolIcon name="more" size={20} /><b>Actions</b></button>}
    </div>
  </header>;
}

export function ToolDock({
  kidMode, tool, panel, stayInLines, color, canUndo,
  onBrush, onStayInLines, onEraser, onFill, onMove, onShapes, onStickers, onReset, onUndo,
}: {
  kidMode: boolean;
  tool: Tool;
  panel: PanelName;
  stayInLines: boolean;
  color: string;
  canUndo: boolean;
  onBrush: () => void;
  onStayInLines: () => void;
  onEraser: () => void;
  onFill: () => void;
  onMove: () => void;
  onShapes: () => void;
  onStickers: () => void;
  onReset: () => void;
  onUndo: () => void;
}) {
  if (kidMode) {
    return <nav className="tool-dock tool-dock--kid" aria-label="Drawing tools" style={{ '--current-color': color } as CSSProperties}>
      <KidTool label="Paint brush" active={tool === 'brush' || panel === 'brush'} onClick={onBrush} className="kid-tool--brush">
        <ToolIcon name="brush" /><span className="kid-tool__paint" aria-hidden="true" />
      </KidTool>
      <KidTool label="Eraser" active={tool === 'eraser'} onClick={onEraser}><ToolIcon name="eraser" /></KidTool>
      <KidTool label="Fill bucket" active={tool === 'fill'} onClick={onFill} className="kid-tool--fill">
        <ToolIcon name="fill" /><span className="kid-tool__paint" aria-hidden="true" />
      </KidTool>
      <KidTool label="Stickers and shapes" active={panel === 'stickers'} onClick={onStickers} className="kid-tool--emoji"><span aria-hidden="true">⭐</span></KidTool>
      <KidTool label="Move stickers" active={tool === 'move'} onClick={onMove} className="kid-tool--emoji"><span aria-hidden="true">✋</span></KidTool>
      <KidTool label="Undo" onClick={onUndo} disabled={!canUndo} className="kid-tool--undo"><ToolIcon name="undo" /></KidTool>
    </nav>;
  }
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

function KidTool({ label, active = false, disabled = false, className = '', onClick, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button
    type="button"
    className={`kid-tool${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
    aria-label={label}
    aria-pressed={active}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >{children}</button>;
}
