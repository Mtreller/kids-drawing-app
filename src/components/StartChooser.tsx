import { useEffect, useState } from 'react';
import { bitmapSource } from '../history';
import { ToolIcon } from '../icons';
import type { DrawingSummary, Profile } from '../storage';
import { playSound } from '../sounds';
import { GrownUpHold } from './GrownUpHold';


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
  const tap = (action: () => void) => () => { playSound('tap'); action(); };
  return <div className="start-chooser start-chooser--kid" role="dialog" aria-modal="true" aria-labelledby="start-chooser-title">
    <div className="start-chooser__panel">
      <header className="start-chooser__header">
        {profile && <button type="button" className="profile-chip" onClick={onSwitchProfile} aria-label={`Switch artist, currently ${profile.name}`}>
          <span className="profile-avatar profile-avatar--chip" style={{ background: profile.color }}>{profile.emoji}</span>
          <b>{profile.name}</b>
        </button>}
        <h1 id="start-chooser-title">What shall we make?</h1>
      </header>
      <div className="kid-choices">
        {showContinue && <button type="button" className="kid-choice kid-choice--continue" onClick={tap(onContinue)}>
          <span className="kid-choice__art kid-choice__art--saved" aria-hidden="true">
            {savedBitmap ? <SavedPreview bitmap={savedBitmap} /> : <span className="kid-choice__emoji">▶️</span>}
            <span className="kid-choice__badge">▶</span>
          </span>
          <b>{sessionStarted ? 'Back to it' : 'Keep going'}</b>
        </button>}
        <button type="button" className="kid-choice kid-choice--color" onClick={tap(onColorDrawing)}>
          <span className="kid-choice__art" aria-hidden="true"><span className="kid-choice__emoji">🖍️</span><span className="kid-choice__emoji kid-choice__emoji--small">📖</span></span>
          <b>Color a picture</b>
        </button>
        <button type="button" className="kid-choice kid-choice--blank" onClick={tap(onBlankCanvas)}>
          <span className="kid-choice__art" aria-hidden="true"><span className="kid-choice__emoji">✏️</span><span className="kid-choice__emoji kid-choice__emoji--small">📄</span></span>
          <b>Draw anything</b>
        </button>
        <button type="button" className="kid-choice kid-choice--mine" onClick={tap(onMyDrawings)}>
          <span className="kid-choice__art" aria-hidden="true"><span className="kid-choice__emoji">🖼️</span>{savedCount > 0 && <span className="kid-choice__count">{savedCount}</span>}</span>
          <b>My art</b>
        </button>
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
      <GrownUpHold
        className="drawing-card__delete"
        label={`Delete ${drawing.title}`}
        onConfirm={() => onDelete(drawing.id)}
        onTapHint={() => playSound('nope')}
      ><ToolIcon name="close" size={16} /></GrownUpHold>
    </div>)}
  </div>;
}
