import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ART_HEIGHT, ART_WIDTH, ArtObject, Point, Snapshot, Tool, canvasPoint,
  drawObject, fillRegion, hitObject, newObject,
} from './drawing';

const colors = [
  '#ff385d', '#ff6b6b', '#ff9f43', '#ffc93c', '#f7e967', '#4fdd89', '#21b66f',
  '#38c9d8', '#3199f4', '#2667ff', '#755cff', '#a855f7', '#df4ec8', '#ff65a3',
  '#f3b78b', '#b9784c', '#704332', '#ffffff', '#aab2bd', '#4b5260', '#171823',
];
const stickers = ['⭐', '🌈', '🦋', '🦖', '🐯', '🐙', '🌸', '❤️', '🚀', '☀️'];
const pawPatrolPages = [
  { title: 'Mighty Pups Team', file: 'mighty-pups-team.webp' },
  { title: 'Everest', file: 'everest-sitting-proudly.webp' },
  { title: 'Skye', file: 'skye-smiling.webp' },
  { title: 'Marshall', file: 'marshall-sitting-panting.webp' },
  { title: 'Chase', file: 'chase-standing-proudly.webp' },
].map((page) => ({ ...page, src: `${import.meta.env.BASE_URL}drawings/paw-patrol/${page.file}` }));

type DragColor = { color: string; x: number; y: number } | null;
type Gesture = { distance: number; angle: number; width: number; height: number; rotation: number };
type ViewGesture = { distance: number; center: Point; zoom: number; pan: Point };

function IconButton({ icon, label, active = false, disabled = false, onClick }: {
  icon: string; label: string; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button className={`icon-button${active ? ' is-active' : ''}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

export function App() {
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const backingRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const screenPointers = useRef(new Map<number, Point>());
  const lastPoint = useRef<Point | null>(null);
  const strokeStarted = useRef(false);
  const fillTap = useRef<Point | null>(null);
  const fillTapMoved = useRef(false);
  const dragOffset = useRef<Point | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const viewGesture = useRef<ViewGesture | null>(null);
  const navigatingCanvas = useRef(false);
  const objectChanged = useRef(false);
  const objectsRef = useRef<ArtObject[]>([]);
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(colors[9]);
  const [brushSize, setBrushSize] = useState(24);
  const [opacity, setOpacity] = useState(1);
  const [tolerance, setTolerance] = useState(32);
  const [objects, setObjects] = useState<ArtObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'shapes' | 'stickers' | 'actions' | 'library' | null>(null);
  const [dragColor, setDragColor] = useState<DragColor>(null);
  const [message, setMessage] = useState('Choose a tool and start creating!');
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });

  useEffect(() => { objectsRef.current = objects; }, [objects]);

  const refreshHistoryState = () => setHistoryState({ undo: history.current.length > 1, redo: future.current.length > 0 });

  const render = useCallback(() => {
    const canvas = visibleRef.current;
    const backing = backingRef.current;
    if (!canvas || !backing) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
    context.drawImage(backing, 0, 0);
    objectsRef.current.forEach((object) => drawObject(context, object, object.id === selectedId));
  }, [selectedId]);

  useEffect(() => { render(); }, [render, objects, revision]);

  const snapshot = useCallback((): Snapshot => ({
    bitmap: backingRef.current?.toDataURL('image/png') ?? '',
    objects: objectsRef.current.map((object) => ({ ...object })),
  }), []);

  const pushHistory = useCallback(() => {
    history.current.push(snapshot());
    if (history.current.length > 30) history.current.shift();
    future.current = [];
    refreshHistoryState();
  }, [snapshot]);

  const applySnapshot = useCallback((next: Snapshot) => {
    const backing = backingRef.current;
    if (!backing) return;
    const image = new Image();
    image.onload = () => {
      const context = backing.getContext('2d')!;
      context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
      context.drawImage(image, 0, 0);
      objectsRef.current = next.objects.map((object) => ({ ...object }));
      setObjects(objectsRef.current);
      setSelectedId(null);
      setRevision((value) => value + 1);
    };
    image.src = next.bitmap;
  }, []);

  useEffect(() => {
    const backing = document.createElement('canvas');
    backing.width = ART_WIDTH;
    backing.height = ART_HEIGHT;
    const context = backing.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
    backingRef.current = backing;
    objectsRef.current = [];
    history.current = [{ bitmap: backing.toDataURL('image/png'), objects: [] }];
    refreshHistoryState();
    setRevision(1);
  }, []);

  const updateObjects = (updater: (items: ArtObject[]) => ArtObject[]) => {
    const next = updater(objectsRef.current);
    objectsRef.current = next;
    setObjects(next);
  };

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage('Choose a tool and start creating!'), 2400);
  };

  const drawLine = (from: Point, to: Point, pointerType = 'touch', pressure = 1) => {
    const context = backingRef.current?.getContext('2d');
    if (!context) return;
    const pressureScale = pointerType === 'pen' ? .3 + Math.max(.05, pressure) * .7 : 1;
    context.save();
    context.globalAlpha = opacity;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = color;
    context.lineWidth = brushSize * pressureScale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
    strokeStarted.current = true;
    setRevision((value) => value + 1);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    viewGesture.current = null;
    navigatingCanvas.current = false;
    notify('Canvas fitted to the screen');
  };

  const fillAt = (point: Point, fillColor = color) => {
    const target = hitObject(objectsRef.current, point);
    if (target) {
      updateObjects((items) => items.map((item) => item.id === target.id ? { ...item, color: fillColor } : item));
      setSelectedId(target.id);
      pushHistory();
      notify('Object colored!');
      return;
    }
    if (backingRef.current && fillRegion(backingRef.current, point, fillColor, tolerance)) {
      setRevision((value) => value + 1);
      window.setTimeout(pushHistory);
      notify('Area filled!');
    } else notify('Try another enclosed area');
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (screenPointers.current.size === 2 && tool !== 'move') {
      if (strokeStarted.current) pushHistory();
      const [a, b] = [...screenPointers.current.values()];
      viewGesture.current = {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        zoom,
        pan: { ...pan },
      };
      lastPoint.current = null;
      strokeStarted.current = false;
      fillTap.current = null;
      fillTapMoved.current = true;
      navigatingCanvas.current = true;
      setMessage('Pinch to zoom • drag two fingers to move');
      return;
    }

    if (tool === 'fill') {
      fillTap.current = point;
      fillTapMoved.current = false;
      return;
    }
    if (tool === 'move') {
      if (pointers.current.size > 1 && selectedId) return;
      const target = hitObject(objectsRef.current, point);
      if (target) {
        setSelectedId(target.id);
        dragOffset.current = { x: point.x - target.x, y: point.y - target.y };
      } else {
        setSelectedId(null);
        dragOffset.current = null;
      }
      return;
    }
    if (pointers.current.size === 1) {
      lastPoint.current = point;
      strokeStarted.current = false;
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (screenPointers.current.size >= 2 && tool !== 'move') {
      const active = [...screenPointers.current.values()];
      const [a, b] = active;
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!viewGesture.current) viewGesture.current = { distance, center, zoom, pan: { ...pan } };
      const nextZoom = Math.max(1, Math.min(4, viewGesture.current.zoom * distance / viewGesture.current.distance));
      const maxPanX = (nextZoom - 1) * 360;
      const maxPanY = (nextZoom - 1) * 280;
      setZoom(nextZoom);
      setPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, viewGesture.current.pan.x + center.x - viewGesture.current.center.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, viewGesture.current.pan.y + center.y - viewGesture.current.center.y)),
      });
      return;
    }

    if (tool === 'fill' && fillTap.current && Math.hypot(point.x - fillTap.current.x, point.y - fillTap.current.y) > 12) {
      fillTapMoved.current = true;
      return;
    }

    if (tool === 'move' && selectedId) {
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (!selected) return;
      const active = [...pointers.current.values()];
      if (active.length >= 2) {
        const [a, b] = active;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (!gesture.current) gesture.current = { distance, angle, width: selected.width, height: selected.height, rotation: selected.rotation };
        const scale = Math.max(.3, Math.min(4, distance / Math.max(gesture.current.distance, 1)));
        updateObjects((items) => items.map((item) => item.id === selectedId ? {
          ...item,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          width: Math.max(70, gesture.current!.width * scale),
          height: Math.max(70, gesture.current!.height * scale),
          rotation: gesture.current!.rotation + angle - gesture.current!.angle,
        } : item));
        objectChanged.current = true;
      } else if (dragOffset.current) {
        updateObjects((items) => items.map((item) => item.id === selectedId ? {
          ...item,
          x: Math.max(item.width / 2, Math.min(ART_WIDTH - item.width / 2, point.x - dragOffset.current!.x)),
          y: Math.max(item.height / 2, Math.min(ART_HEIGHT - item.height / 2, point.y - dragOffset.current!.y)),
        } : item));
        objectChanged.current = true;
      }
      return;
    }
    if ((tool === 'brush' || tool === 'eraser') && lastPoint.current && pointers.current.size === 1) {
      drawLine(lastPoint.current, point, event.pointerType, event.pressure || 1);
      lastPoint.current = point;
    }
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hadMultiplePointers = screenPointers.current.size > 1;
    const releasedPoint = pointers.current.get(event.pointerId) ?? null;
    pointers.current.delete(event.pointerId);
    screenPointers.current.delete(event.pointerId);
    if (screenPointers.current.size < 2) viewGesture.current = null;

    if (tool === 'fill' && fillTap.current && !fillTapMoved.current && !hadMultiplePointers) {
      fillAt(fillTap.current);
    }
    if (!pointers.current.size) {
      if ((tool === 'brush' || tool === 'eraser') && lastPoint.current && !strokeStarted.current && releasedPoint && !hadMultiplePointers) {
        drawLine(lastPoint.current, { x: lastPoint.current.x + .1, y: lastPoint.current.y + .1 }, event.pointerType, event.pressure || 1);
      }
      if ((tool === 'brush' || tool === 'eraser') && strokeStarted.current) pushHistory();
      if (tool === 'move' && objectChanged.current) pushHistory();
      lastPoint.current = null;
      strokeStarted.current = false;
      fillTap.current = null;
      fillTapMoved.current = false;
      dragOffset.current = null;
      gesture.current = null;
      objectChanged.current = false;
      if (navigatingCanvas.current) {
        navigatingCanvas.current = false;
        notify(`Canvas zoom ${Math.round(zoom * 100)}%`);
      }
    }
  };

  const undo = () => {
    if (history.current.length <= 1) return;
    future.current.push(history.current.pop()!);
    applySnapshot(history.current.at(-1)!);
    refreshHistoryState();
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(next);
    applySnapshot(next);
    refreshHistoryState();
  };

  const addObject = (kind: ArtObject['kind'], sticker?: string) => {
    const object = newObject(kind, color, sticker);
    updateObjects((items) => [...items, object]);
    setSelectedId(object.id);
    setTool('move');
    setPanel(null);
    pushHistory();
    notify('Use one finger to move, two fingers to resize and rotate');
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateObjects((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
    pushHistory();
    notify('Object removed');
  };

  const clearArt = () => {
    const context = backingRef.current?.getContext('2d');
    if (!context) return;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
    objectsRef.current = [];
    setObjects([]);
    setSelectedId(null);
    setRevision((value) => value + 1);
    window.setTimeout(pushHistory);
    notify('Fresh canvas ready');
  };

  const placeImage = (image: HTMLImageElement, successMessage: string) => {
      const context = backingRef.current?.getContext('2d');
      if (!context) return;
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
      const padding = 48;
      const scale = Math.min((ART_WIDTH - padding * 2) / image.width, (ART_HEIGHT - padding * 2) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (ART_WIDTH - width) / 2;
      const y = (ART_HEIGHT - height) / 2;
      context.drawImage(image, x, y, width, height);
      context.strokeStyle = '#171823';
      context.lineWidth = 12;
      context.strokeRect(x - 6, y - 6, width + 12, height + 12);
      objectsRef.current = [];
      setObjects([]);
      setSelectedId(null);
      setRevision((value) => value + 1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      window.setTimeout(pushHistory);
      setPanel(null);
      notify(successMessage);
  };

  const upload = (file: File) => {
    const image = new Image();
    image.onload = () => {
      placeImage(image, 'Picture fitted with a protected fill border');
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
  };

  const loadLibraryPage = (src: string, title: string) => {
    const image = new Image();
    image.onload = () => placeImage(image, `${title} is ready to color!`);
    image.onerror = () => notify('That coloring page could not be loaded');
    image.src = src;
  };

  const save = () => {
    const output = document.createElement('canvas');
    output.width = ART_WIDTH; output.height = ART_HEIGHT;
    const context = output.getContext('2d')!;
    context.drawImage(backingRef.current!, 0, 0);
    objectsRef.current.forEach((object) => drawObject(context, object));
    const link = document.createElement('a');
    link.download = `color-pop-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
    notify('Artwork saved as PNG');
  };

  const startColorDrag = (event: React.PointerEvent, swatchColor: string) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 9) moved = true;
      if (moved) setDragColor({ color: swatchColor, x: moveEvent.clientX, y: moveEvent.clientY });
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragColor(null);
      if (!moved) { setColor(swatchColor); return; }
      const canvas = visibleRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (canvas && rect && upEvent.clientX >= rect.left && upEvent.clientX <= rect.right && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
        fillAt(canvasPoint(canvas, upEvent.clientX, upEvent.clientY), swatchColor);
      } else notify('Drop the color inside the canvas');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand__mark" aria-hidden="true">✦</span><span>Color Pop</span></div>
        <div className="topbar__actions">
          <IconButton icon="↶" label="Undo" disabled={!historyState.undo} onClick={undo} />
          <IconButton icon="↷" label="Redo" disabled={!historyState.redo} onClick={redo} />
          <button className="library-button" type="button" onClick={() => setPanel('library')}><span aria-hidden="true">▦</span><b>Drawings</b></button>
          <button className="gallery-button" type="button" onClick={() => setPanel(panel === 'actions' ? null : 'actions')}><span aria-hidden="true">•••</span><b>Actions</b></button>
        </div>
      </header>

      <section className="workspace">
        <aside className="side-controls" aria-label="Brush size">
          <span className="control-value">{brushSize}</span>
          <input aria-label="Brush size" type="range" min="3" max="90" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
          <span className="control-label">Size</span>
        </aside>
        <div className="canvas-stage" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
        <div className="canvas-wrap">
          <canvas
            ref={visibleRef} width={ART_WIDTH} height={ART_HEIGHT} aria-label="Drawing canvas"
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
          />
          {selectedId && <button className="delete-object" type="button" onClick={deleteSelected} aria-label="Delete selected object">×</button>}
        </div>
        </div>
        <aside className="side-controls side-controls--right" aria-label="Brush opacity">
          <span className="control-value">{Math.round(opacity * 100)}%</span>
          <input aria-label="Brush opacity" type="range" min="10" max="100" value={opacity * 100} onChange={(event) => setOpacity(Number(event.target.value) / 100)} />
          <span className="control-label">Opacity</span>
        </aside>
        <div className="status-pill" role="status">{message}</div>
        <button className="zoom-reset" type="button" onClick={resetView} aria-label="Fit canvas to screen">{Math.round(zoom * 100)}%</button>
      </section>

      <nav className="tool-dock" aria-label="Drawing tools">
        <IconButton icon="✎" label="Brush" active={tool === 'brush'} onClick={() => { setTool('brush'); setPanel(null); }} />
        <IconButton icon="⌁" label="Eraser" active={tool === 'eraser'} onClick={() => { setTool('eraser'); setPanel(null); }} />
        <IconButton icon="◇" label="Fill" active={tool === 'fill'} onClick={() => { setTool('fill'); setPanel(null); notify('Tap an area, or drag a color onto it'); }} />
        <IconButton icon="↖" label="Move objects" active={tool === 'move'} onClick={() => { setTool('move'); setPanel(null); }} />
        <IconButton icon="□" label="Shapes" active={panel === 'shapes'} onClick={() => setPanel(panel === 'shapes' ? null : 'shapes')} />
        <IconButton icon="★" label="Stickers" active={panel === 'stickers'} onClick={() => setPanel(panel === 'stickers' ? null : 'stickers')} />
      </nav>

      {panel === 'shapes' && <div className="popover shapes-popover">
        <button onClick={() => addObject('rectangle')}>▰<span>Rectangle</span></button>
        <button onClick={() => addObject('circle')}>●<span>Circle</span></button>
        <button onClick={() => addObject('star')}>★<span>Star</span></button>
      </div>}
      {panel === 'stickers' && <div className="popover sticker-popover">{stickers.map((item) => <button key={item} onClick={() => addObject('sticker', item)}>{item}</button>)}</div>}
      {panel === 'actions' && <div className="popover actions-popover">
        <button onClick={() => fileRef.current?.click()}>⬆️ <span>Upload picture</span></button>
        <button onClick={save}>⬇️ <span>Save PNG</span></button>
        <button onClick={clearArt}>✨ <span>New canvas</span></button>
        <label>Fill tolerance <b>{tolerance}</b><input type="range" min="5" max="80" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
      </div>}
      {panel === 'library' && <div className="library-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
        <section className="library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title">
          <header>
            <div><span className="eyebrow">Drawing library</span><h2 id="library-title">Pick a page</h2></div>
            <button type="button" aria-label="Close drawing library" onClick={() => setPanel(null)}>×</button>
          </header>
          <div className="category-heading"><span>🐾</span><div><h3>Paw Patrol</h3><p>Five adventures ready to color</p></div></div>
          <div className="drawing-grid">
            {pawPatrolPages.map((page) => <button key={page.file} type="button" className="drawing-card" onClick={() => loadLibraryPage(page.src, page.title)}>
              <span className="drawing-card__preview"><img src={page.src} alt="" loading="lazy" /></span>
              <strong>{page.title}</strong>
              <small>Tap to color</small>
            </button>)}
          </div>
        </section>
      </div>}

      <footer className="palette" aria-label="Color palette">
        <div className="palette__scroller">
          {colors.map((swatchColor) => <button key={swatchColor} type="button" className={`swatch${color === swatchColor ? ' is-selected' : ''}`} style={{ backgroundColor: swatchColor }} aria-label={`Select or drag color ${swatchColor}`} onPointerDown={(event) => startColorDrag(event, swatchColor)} />)}
          <label className="swatch swatch--picker" aria-label="Choose a custom color">＋<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        </div>
      </footer>
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ''; }} />
      {dragColor && <div className="color-drop-orb" style={{ left: dragColor.x, top: dragColor.y, backgroundColor: dragColor.color }} />}
    </main>
  );
}
