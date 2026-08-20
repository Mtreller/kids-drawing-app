import { useEffect, useState } from 'react';
import { bitmapSource } from '../history';
import { ToolIcon } from '../icons';

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
  savedBitmap,
  showContinue,
  sessionStarted,
  onColorDrawing,
  onBlankCanvas,
  onContinue,
}: {
  savedBitmap: string | Blob | null;
  showContinue: boolean;
  sessionStarted: boolean;
  onColorDrawing: () => void;
  onBlankCanvas: () => void;
  onContinue: () => void;
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
