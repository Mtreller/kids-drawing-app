import { useState } from 'react';
import { ToolIcon } from '../icons';
import type { DrawingSummary } from '../storage';
import { SavedDrawingGrid } from './StartChooser';

type DrawingPage = { title: string; file: string; src: string };

const pages = (folder: string, entries: Array<Omit<DrawingPage, 'src'>>) =>
  entries.map((page) => ({ ...page, src: `${import.meta.env.BASE_URL}drawings/${folder}/${page.file}` }));

const pawPatrolPages = pages('paw-patrol', [
  { title: 'Mighty Pups Team', file: 'mighty-pups-team.webp' },
  { title: 'Everest', file: 'everest-sitting-proudly.webp' },
  { title: 'Skye', file: 'skye-smiling.webp' },
  { title: 'Marshall', file: 'marshall-sitting-panting.webp' },
  { title: 'Chase', file: 'chase-standing-proudly.webp' },
]);

const unicornPrincessPages = pages('unicorns-princesses', [
  { title: 'Mermaid & Dolphin Friends', file: 'mermaid-dolphin-friends.webp' },
  { title: 'Dreamy Unicorn', file: 'unicorn-hill.webp' },
]);

const stitchPages = pages('stitch', [
  { title: 'Bubble Tea', file: 'bubble-tea.webp' },
  { title: 'Hula Dance', file: 'hula-dance.webp' },
  { title: 'Christmas Surprise', file: 'christmas-surprise.webp' },
  { title: 'Sandcastle Fun', file: 'sandcastle-fun.webp' },
  { title: 'Sleepy Stitch', file: 'sleepy-stitch.webp' },
  { title: 'The Big Shoe', file: 'big-shoe.webp' },
  { title: 'Curious Stitch', file: 'curious-stitch.webp' },
  { title: 'Happy Stitch', file: 'happy-stitch.webp' },
]);

function DrawingGrid({ entries, className = '', onSelect }: {
  entries: DrawingPage[];
  className?: string;
  onSelect: (src: string, title: string) => void;
}) {
  return <div className={`drawing-grid${className ? ` ${className}` : ''}`}>
    {entries.map((page) => <button key={page.file} type="button" className="drawing-card" onClick={() => onSelect(page.src, page.title)}>
      <span className="drawing-card__preview"><img src={page.src} alt="" loading="lazy" /></span>
      <strong>{page.title}</strong>
      <small>Tap to color</small>
    </button>)}
  </div>;
}

export function DrawingLibrary({
  initialTab = 'pages',
  savedDrawings,
  artistName,
  onClose,
  onSelect,
  onSelectSaved,
  onDeleteSaved,
}: {
  initialTab?: 'pages' | 'saved';
  savedDrawings: DrawingSummary[];
  artistName: string;
  onClose: () => void;
  onSelect: (src: string, title: string) => void;
  onSelectSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const [tab, setTab] = useState<'pages' | 'saved'>(initialTab);
  return <div className="library-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title">
      <header>
        <div><span className="eyebrow">Drawing library</span><h2 id="library-title">{tab === 'saved' ? `${artistName}’s drawings` : 'Pick a page'}</h2></div>
        <button type="button" aria-label="Close drawing library" onClick={onClose}><ToolIcon name="close" size={22} /></button>
      </header>
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        <button type="button" role="tab" aria-selected={tab === 'pages'} className={tab === 'pages' ? 'is-active' : ''} onClick={() => setTab('pages')}>Coloring pages</button>
        <button type="button" role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'is-active' : ''} onClick={() => setTab('saved')}>My drawings{savedDrawings.length ? ` (${savedDrawings.length})` : ''}</button>
      </div>
      {tab === 'saved' ? <SavedDrawingGrid
        drawings={savedDrawings}
        emptyLabel="Nothing saved yet. Color a page, then it will show up here."
        onSelect={onSelectSaved}
        onDelete={onDeleteSaved}
      /> : <>
        <div className="category-heading"><span>🐾</span><div><h3>Paw Patrol</h3><p>Five adventures ready to color</p></div></div>
        <DrawingGrid entries={pawPatrolPages} onSelect={onSelect} />
        <div className="category-heading category-heading--magic"><span>🦄</span><div><h3>Unicorns &amp; Princesses</h3><p>Magical friends and underwater adventures</p></div></div>
        <DrawingGrid entries={unicornPrincessPages} className="drawing-grid--landscape" onSelect={onSelect} />
        <div className="category-heading category-heading--stitch"><span>🌺</span><div><h3>Stitch</h3><p>Eight playful adventures ready to color</p></div></div>
        <DrawingGrid entries={stitchPages} className="drawing-grid--portrait" onSelect={onSelect} />
      </>}
    </section>
  </div>;
}
