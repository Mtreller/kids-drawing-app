import { useEffect, useState } from 'react';
import { bitmapSource } from '../history';
import { ToolIcon } from '../icons';
import type { DrawingSummary, Profile } from '../storage';

const previewPages = [
  `${import.meta.env.BASE_URL}drawings/paw-patrol/skye-smiling.webp`,
  `${import.meta.env.BASE_URL}drawings/unicorns-princesses/unicorn-hill.webp`,
  `${import.meta.env.BASE_URL}drawings/stitch/happy-stitch.webp`,
  `${import.meta.env.BASE_URL}drawings/paw-patrol/chase-standing-proudly.webp`,
];

function SavedPreview({ bitmap }: { bitmap: string | Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const source = bitmapSource(bitmap);
    setUrl(source.url);
    return source.release;
  }, [bitmap]);
  if (!url) return <span className="start-chooser__blank-preview" aria-hidden="true" />;
  return <img src={url} alt="" />;
}

export function StartChooser({
  profile,
  savedBitmap,
  savedCount,
  showContinue,
  sessionStarted,
  onColorDrawing,
  onBlankCanvas,
  onMyDrawings,
  onContinue,
  onSwitchProfile,
}: {
  profile: Profile | null;
  savedBitmap: string | Blob | null;
  savedCount: number;
  showContinue: boolean;
  sessionStarted: boolean;
  onColorDrawing: () => void;
  onBlankCanvas: () => void;
  onMyDrawings: () => void;
  onContinue: () => void;
  onSwitchProfile: () => void;
}) {
  const continueLabel = sessionStarted ? 'Keep this drawing' : 'Continue last drawing';
  return <div className="start-chooser" role="dialog" aria-modal="true" aria-labelledby="start-chooser-title">
    <div className="start-chooser__panel">
      <header className="start-chooser__header">
        <span className="brand__mark" aria-hidden="true">✦</span>
        <div>
          <span className="eyebrow">Color Pop</span>
          <h1 id="start-chooser-title">What do you want to make?</h1>
        </div>
        {profile && <button type="button" className="profile-chip" onClick={onSwitchProfile} aria-label={`Switch artist, currently ${profile.name}`}>
          <span className="profile-avatar profile-avatar--chip" style={{ background: profile.color }}>{profile.emoji}</span>
          <span>
            <b>{profile.name}</b>
            <small>Switch artist</small>
          </span>
        </button>}
      </header>
      <div className="start-chooser__choices">
        <button type="button" className="start-choice start-choice--drawings" onClick={onColorDrawing}>
          <span className="start-choice__mosaic" aria-hidden="true">
            {previewPages.map((src) => <img key={src} src={src} alt="" />)}
          </span>
          <span className="start-choice__copy">
            <ToolIcon name="library" size={22} />
            <b>Color a drawing</b>
            <small>Pick a coloring page</small>
          </span>
        </button>
        <button type="button" className="start-choice start-choice--blank" onClick={onBlankCanvas}>
          <span className="start-choice__blank-preview" aria-hidden="true">
            <ToolIcon name="newCanvas" size={42} />
          </span>
          <span className="start-choice__copy">
            <ToolIcon name="page" size={22} />
            <b>Blank canvas</b>
            <small>Start with a fresh page</small>
          </span>
        </button>
        <button type="button" className="start-choice start-choice--mine" onClick={onMyDrawings}>
          <span className="start-choice__blank-preview" aria-hidden="true">
            <ToolIcon name="continue" size={42} />
          </span>
          <span className="start-choice__copy">
            <ToolIcon name="library" size={22} />
            <b>My drawings</b>
            <small>{savedCount ? `${savedCount} saved ${savedCount === 1 ? 'picture' : 'pictures'}` : 'Saved pictures live here'}</small>
          </span>
        </button>
        {showContinue && <button type="button" className="start-choice start-choice--continue" onClick={onContinue}>
          <span className="start-choice__saved-preview" aria-hidden="true">
            {savedBitmap ? <SavedPreview bitmap={savedBitmap} /> : <span className="start-chooser__blank-preview" />}
          </span>
          <span className="start-choice__copy">
            <ToolIcon name="continue" size={22} />
            <b>{continueLabel}</b>
            <small>{sessionStarted ? 'Go back to the page on screen' : 'Pick up where you left off'}</small>
          </span>
        </button>}
      </div>
    </div>
  </div>;
}

export function Thumbnail({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const source = bitmapSource(blob);
    setUrl(source.url);
    return source.release;
  }, [blob]);
  if (!url) return null;
  return <img src={url} alt="" />;
}

export function SavedDrawingGrid({ drawings, emptyLabel, onSelect, onDelete }: {
  drawings: DrawingSummary[];
  emptyLabel: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!drawings.length) {
    return <p className="saved-empty">{emptyLabel}</p>;
  }
  return <div className="drawing-grid">
    {drawings.map((drawing) => <div key={drawing.id} className="drawing-card drawing-card--saved">
      <button type="button" className="drawing-card__open" onClick={() => onSelect(drawing.id)}>
        <span className="drawing-card__preview"><Thumbnail blob={drawing.thumbnail} /></span>
        <strong>{drawing.title}</strong>
        <small>Open saved picture</small>
      </button>
      <button
        type="button"
        className="drawing-card__delete"
        aria-label={`Delete ${drawing.title}`}
        onClick={() => {
          if (window.confirm(`Delete “${drawing.title}”?`)) onDelete(drawing.id);
        }}
      ><ToolIcon name="close" size={16} /></button>
    </div>)}
  </div>;
}
