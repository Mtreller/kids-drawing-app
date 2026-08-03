import { useEffect, useRef, useState } from 'react';

const colors = ['#ff5c77', '#ff9f43', '#ffd93d', '#52d681', '#3eb8f0', '#755cff', '#d95ce5', '#6f4935'];

function IconButton({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <button className={`icon-button${active ? ' is-active' : ''}`} type="button" aria-label={label} title={label}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function CanvasSurface() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const render = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, rect.width, rect.height);

      context.strokeStyle = '#eeeaf5';
      context.lineWidth = 2;
      context.setLineDash([8, 12]);
      context.beginPath();
      context.roundRect(28, 28, Math.max(rect.width - 56, 0), Math.max(rect.height - 56, 0), 24);
      context.stroke();
    };

    const observer = new ResizeObserver(render);
    observer.observe(wrap);
    render();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="Drawing canvas" />
      <div className="canvas-hint" aria-hidden="true">
        <span>✦</span>
        <strong>Your canvas is ready</strong>
        <small>Drawing tools are coming next</small>
      </div>
    </div>
  );
}

export function App() {
  const [selectedColor, setSelectedColor] = useState(colors[5]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Color Pop">
          <span className="brand__mark" aria-hidden="true">✦</span>
          <span>Color Pop</span>
        </div>
        <div className="topbar__actions">
          <IconButton icon="↶" label="Undo" />
          <IconButton icon="↷" label="Redo" />
          <button className="gallery-button" type="button"><span aria-hidden="true">▦</span> Gallery</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="side-controls" aria-label="Brush controls">
          <IconButton icon="＋" label="Increase brush size" />
          <div className="slider-track"><span style={{ height: '56%' }} /></div>
          <IconButton icon="−" label="Decrease brush size" />
        </aside>

        <CanvasSurface />

        <aside className="side-controls side-controls--right" aria-label="Opacity controls">
          <span className="control-label">100%</span>
          <div className="slider-track"><span style={{ height: '100%' }} /></div>
          <span className="control-label">Opacity</span>
        </aside>
      </section>

      <nav className="tool-dock" aria-label="Drawing tools">
        <IconButton icon="✎" label="Brush" active />
        <IconButton icon="⌁" label="Eraser" />
        <IconButton icon="◇" label="Fill" />
        <IconButton icon="★" label="Stickers" />
        <IconButton icon="□" label="Shapes" />
      </nav>

      <footer className="palette" aria-label="Color palette">
        <div className="palette__scroller">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch${selectedColor === color ? ' is-selected' : ''}`}
              style={{ backgroundColor: color }}
              aria-label={`Select color ${color}`}
              onClick={() => setSelectedColor(color)}
            />
          ))}
          <button className="swatch swatch--picker" type="button" aria-label="Open color picker">＋</button>
        </div>
      </footer>
    </main>
  );
}
