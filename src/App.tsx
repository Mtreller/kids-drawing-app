import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ART_HEIGHT, ART_WIDTH, ArtObject, Point, Snapshot, Tool,
  drawObject, fillRegion, hitObject, hitResizeHandle, hitRotateHandle, newObject,
} from './drawing';
import { loadCurrentArtwork, saveCurrentArtwork } from './storage';
import { ToolIcon } from './icons';
import { brushPresets, drawBrushStroke, renderBrushStroke, type BrushType } from './brushes';
import { copyCanvas, createRegionMaskCache, getRegionMask, restoreBaseLine, type RegionMaskCache } from './regionMask';

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
const unicornPrincessPages = [
  { title: 'Mermaid & Dolphin Friends', file: 'mermaid-dolphin-friends.webp' },
  { title: 'Dreamy Unicorn', file: 'unicorn-hill.webp' },
].map((page) => ({ ...page, src: `${import.meta.env.BASE_URL}drawings/unicorns-princesses/${page.file}` }));
const stitchPages = [
  { title: 'Bubble Tea', file: 'bubble-tea.webp' },
  { title: 'Hula Dance', file: 'hula-dance.webp' },
  { title: 'Christmas Surprise', file: 'christmas-surprise.webp' },
  { title: 'Sandcastle Fun', file: 'sandcastle-fun.webp' },
  { title: 'Sleepy Stitch', file: 'sleepy-stitch.webp' },
  { title: 'The Big Shoe', file: 'big-shoe.webp' },
  { title: 'Curious Stitch', file: 'curious-stitch.webp' },
  { title: 'Happy Stitch', file: 'happy-stitch.webp' },
].map((page) => ({ ...page, src: `${import.meta.env.BASE_URL}drawings/stitch/${page.file}` }));
const magicBrushes = brushPresets.filter((brush) => brush.group === 'Magic');

type DragColor = { color: string; x: number; y: number } | null;
type Gesture = { distance: number; angle: number; width: number; height: number; rotation: number };
type ViewGesture = { distance: number; angle: number; center: Point; zoom: number; pan: Point; rotation: number };
type MultiTouch = { startedAt: number; maxPointers: number; moved: boolean; initial: Map<number, Point> };
type MouseResize = { id: string; distance: number; width: number; height: number };
type MouseRotate = { id: string; angle: number; rotation: number };
type PageBase = { bitmap: string; width: number; height: number };
type BrushCursor = { x: number; y: number } | null;

const rangeStyle = (value: number, minimum: number, maximum: number) => ({
  '--range-progress': `${(value - minimum) / (maximum - minimum) * 100}%`,
} as CSSProperties);
const BRUSH_MIN = 3;
const BRUSH_MAX = 240;

function IconButton({ icon, label, active = false, disabled = false, className = '', onClick }: {
  icon: ReactNode; label: string; active?: boolean; disabled?: boolean; className?: string; onClick?: () => void;
}) {
  return (
    <button className={`icon-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function VerticalRange({ label, minimum, maximum, value, onChange }: {
  label: string;
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onChange(Math.round(minimum + progress * (maximum - minimum)));
  };
  return (
    <div
      className="vertical-range-wrap"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.querySelector('input')?.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
      }}
      onPointerUp={updateFromPointer}
    >
      <input
        className="polished-range"
        style={rangeStyle(value, minimum, maximum)}
        aria-label={label}
        type="range"
        min={minimum}
        max={maximum}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function BrushStrokePreview({ type, color, size, alpha }: { type: BrushType; color: string; size: number; alpha: number }) {
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
      size: Math.max(10, Math.min(54, size * .42)),
      alpha,
      type,
    });
  }, [alpha, color, size, type]);
  return <canvas ref={previewRef} width="480" height="76" aria-label={`${type} brush preview`} />;
}

function MagicBrushPreview({ type, color }: { type: BrushType; color: string }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderBrushStroke(context, {
      from: { x: 9, y: 39 },
      to: { x: 45, y: 15 },
      color,
      size: 20,
      alpha: 1,
      type,
    });
  }, [color, type]);
  return <canvas ref={previewRef} width="54" height="54" aria-hidden="true" />;
}

export function App() {
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const backingRef = useRef<HTMLCanvasElement | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const sizeControlRef = useRef<HTMLElement>(null);
  const opacityControlRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const screenPointers = useRef(new Map<number, Point>());
  const viewPointerOnCanvas = useRef(new Map<number, boolean>());
  const lastPoint = useRef<Point | null>(null);
  const strokeStarted = useRef(false);
  const fillTap = useRef<Point | null>(null);
  const fillTapMoved = useRef(false);
  const dragOffset = useRef<Point | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const viewGesture = useRef<ViewGesture | null>(null);
  const navigatingCanvas = useRef(false);
  const multiTouch = useRef<MultiTouch | null>(null);
  const mousePan = useRef<{ point: Point; pan: Point } | null>(null);
  const mouseResize = useRef<MouseResize | null>(null);
  const mouseRotate = useRef<MouseRotate | null>(null);
  const spaceHeld = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const objectChanged = useRef(false);
  const objectsRef = useRef<ArtObject[]>([]);
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const pageBaseRef = useRef<PageBase | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionMaskCacheRef = useRef<RegionMaskCache | null>(null);
  const activeRegionMaskRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fillPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fillPreviewTargetRef = useRef<HTMLCanvasElement | string | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(colors[9]);
  const [brushSize, setBrushSize] = useState(24);
  const [opacity, setOpacity] = useState(1);
  const [flow, setFlow] = useState(.8);
  const [smoothing, setSmoothing] = useState(.35);
  const [brushType, setBrushType] = useState<BrushType>('round');
  const [stayInLines, setStayInLines] = useState(true);
  const [tolerance, setTolerance] = useState(32);
  const [objects, setObjects] = useState<ArtObject[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: ART_WIDTH, height: ART_HEIGHT });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'shapes' | 'stickers' | 'brush' | 'actions' | 'library' | null>(null);
  const [dragColor, setDragColor] = useState<DragColor>(null);
  const [fillPreviewActive, setFillPreviewActive] = useState(false);
  const [brushCursor, setBrushCursor] = useState<BrushCursor>(null);
  const [message, setMessage] = useState('Choose a tool and start creating!');
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [canvasRotation, setCanvasRotation] = useState(0);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const [focusMode, setFocusMode] = useState(false);
  const [showIosFocusHelp, setShowIosFocusHelp] = useState(false);
  const [drawingActive, setDrawingActive] = useState(false);
  const [leftHanded, setLeftHanded] = useState(() => {
    try { return window.localStorage.getItem('color-pop-left-handed') === 'true'; }
    catch { return false; }
  });

  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => {
    try { window.localStorage.setItem('color-pop-left-handed', String(leftHanded)); }
    catch { /* Settings still work for this session when storage is unavailable. */ }
  }, [leftHanded]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('color-pop-brush') ?? '{}') as { flow?: number; smoothing?: number; stayInLines?: boolean; brushType?: BrushType };
      if (typeof saved.flow === 'number') setFlow(saved.flow);
      if (typeof saved.smoothing === 'number') setSmoothing(saved.smoothing);
      if (saved.brushType && brushPresets.some((brush) => brush.id === saved.brushType)) setBrushType(saved.brushType);
      const saferDefaultApplied = window.localStorage.getItem('color-pop-stay-inside-default-v1') === 'true';
      if (saferDefaultApplied && typeof saved.stayInLines === 'boolean') setStayInLines(saved.stayInLines);
      else window.localStorage.setItem('color-pop-stay-inside-default-v1', 'true');
    } catch { /* Use the friendly defaults when settings cannot be restored. */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('color-pop-brush', JSON.stringify({ flow, smoothing, stayInLines, brushType })); }
    catch { /* Settings still work for this session when storage is unavailable. */ }
  }, [brushType, flow, smoothing, stayInLines]);
  useEffect(() => {
    const fullscreenChanged = () => { if (!document.fullscreenElement) setFocusMode(false); };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    return () => document.removeEventListener('fullscreenchange', fullscreenChanged);
  }, []);
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  useLayoutEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    const measure = () => {
      const controls = [sizeControlRef.current, opacityControlRef.current].filter((element) => {
        if (!element || element.offsetWidth <= 0) return false;
        const position = getComputedStyle(element).position;
        return position !== 'fixed' && position !== 'absolute';
      }) as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(cluster).columnGap) || 0;
      const availableWidth = Math.max(1, cluster.clientWidth - controls.reduce((sum, element) => sum + element.offsetWidth, 0) - gap * controls.length);
      const availableHeight = Math.max(1, cluster.clientHeight);
      const ratio = canvasSize.width / canvasSize.height;
      const cosine = Math.abs(Math.cos(canvasRotation));
      const sine = Math.abs(Math.sin(canvasRotation));
      const height = Math.min(
        availableWidth / Math.max(.001, ratio * cosine + sine),
        availableHeight / Math.max(.001, ratio * sine + cosine),
      );
      const width = height * ratio;
      setDisplaySize((current) => current && Math.abs(current.width - width) < .5 && Math.abs(current.height - height) < .5 ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cluster);
    if (sizeControlRef.current) observer.observe(sizeControlRef.current);
    if (opacityControlRef.current) observer.observe(opacityControlRef.current);
    return () => observer.disconnect();
  }, [canvasSize.width, canvasSize.height, canvasRotation, focusMode]);

  const pointFromClient = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number, requireInside = false): Point | null => {
    const rect = canvas.getBoundingClientRect();
    const visualX = clientX - (rect.left + rect.width / 2);
    const visualY = clientY - (rect.top + rect.height / 2);
    const cosine = Math.cos(canvasRotation);
    const sine = Math.sin(canvasRotation);
    const localX = (visualX * cosine + visualY * sine) / zoom + canvas.clientWidth / 2;
    const localY = (-visualX * sine + visualY * cosine) / zoom + canvas.clientHeight / 2;
    if (requireInside && (localX < 0 || localX > canvas.clientWidth || localY < 0 || localY > canvas.clientHeight)) return null;
    return {
      x: Math.max(0, Math.min(canvas.width, localX * canvas.width / Math.max(1, canvas.clientWidth))),
      y: Math.max(0, Math.min(canvas.height, localY * canvas.height / Math.max(1, canvas.clientHeight))),
    };
  }, [canvasRotation, zoom]);

  useEffect(() => {
    const preventInterfacePinch = (event: Event) => {
      if (!(event.target as Element | null)?.closest('.canvas-wrap')) event.preventDefault();
    };
    document.addEventListener('gesturestart', preventInterfacePinch, { passive: false });
    document.addEventListener('gesturechange', preventInterfacePinch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventInterfacePinch);
      document.removeEventListener('gesturechange', preventInterfacePinch);
    };
  }, []);

  const haptic = (pattern: number | number[] = 8) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  };

  const refreshHistoryState = () => setHistoryState({ undo: history.current.length > 1, redo: future.current.length > 0 });

  const render = useCallback(() => {
    const canvas = visibleRef.current;
    const backing = backingRef.current;
    if (!canvas || !backing) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(backing, 0, 0);
    objectsRef.current.forEach((object) => drawObject(context, object, object.id === selectedId));
  }, [selectedId]);

  useEffect(() => { render(); }, [render, objects, revision]);

  const capturePageBase = useCallback((source: HTMLCanvasElement) => {
    const baseCanvas = copyCanvas(source);
    baseCanvasRef.current = baseCanvas;
    regionMaskCacheRef.current = null;
    activeRegionMaskRef.current = null;
    pageBaseRef.current = { bitmap: baseCanvas.toDataURL('image/png'), width: baseCanvas.width, height: baseCanvas.height };
  }, []);

  const restoreBaseCanvas = useCallback((base: PageBase) => {
    pageBaseRef.current = base;
    regionMaskCacheRef.current = null;
    activeRegionMaskRef.current = null;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, base.width, base.height);
      baseCanvasRef.current = canvas;
    };
    image.src = base.bitmap;
  }, []);

  const snapshot = useCallback((): Snapshot => ({
    bitmap: backingRef.current?.toDataURL('image/png') ?? '',
    objects: objectsRef.current.map((object) => ({ ...object })),
    width: backingRef.current?.width ?? ART_WIDTH,
    height: backingRef.current?.height ?? ART_HEIGHT,
    baseBitmap: pageBaseRef.current?.bitmap,
    baseWidth: pageBaseRef.current?.width,
    baseHeight: pageBaseRef.current?.height,
  }), []);

  const pushHistory = useCallback(() => {
    const current = snapshot();
    history.current.push(current);
    if (history.current.length > 30) history.current.shift();
    future.current = [];
    void saveCurrentArtwork(current).catch(() => undefined);
    refreshHistoryState();
  }, [snapshot]);

  const applySnapshot = useCallback((next: Snapshot) => {
    const backing = backingRef.current;
    if (!backing) return;
    const image = new Image();
    image.onload = () => {
      const width = next.width ?? image.naturalWidth ?? ART_WIDTH;
      const height = next.height ?? image.naturalHeight ?? ART_HEIGHT;
      backing.width = width;
      backing.height = height;
      const context = backing.getContext('2d')!;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      restoreBaseCanvas({
        bitmap: next.baseBitmap ?? next.bitmap,
        width: next.baseWidth ?? width,
        height: next.baseHeight ?? height,
      });
      setCanvasSize({ width, height });
      objectsRef.current = next.objects.map((object) => ({ ...object }));
      setObjects(objectsRef.current);
      setSelectedId(null);
      setRevision((value) => value + 1);
    };
    image.src = next.bitmap;
  }, [restoreBaseCanvas]);

  useEffect(() => {
    const backing = document.createElement('canvas');
    backing.width = ART_WIDTH;
    backing.height = ART_HEIGHT;
    const context = backing.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
    backingRef.current = backing;
    objectsRef.current = [];
    const blankBitmap = backing.toDataURL('image/png');
    capturePageBase(backing);
    history.current = [{
      bitmap: blankBitmap,
      objects: [],
      width: ART_WIDTH,
      height: ART_HEIGHT,
      baseBitmap: blankBitmap,
      baseWidth: ART_WIDTH,
      baseHeight: ART_HEIGHT,
    }];
    refreshHistoryState();
    setRevision(1);
    void loadCurrentArtwork().then((saved) => {
      if (!saved?.bitmap) return;
      history.current = [saved];
      applySnapshot(saved);
      setMessage('Your last drawing was restored');
    }).catch(() => undefined);
  }, [applySnapshot, capturePageBase]);

  const updateObjects = (updater: (items: ArtObject[]) => ArtObject[]) => {
    const next = updater(objectsRef.current);
    objectsRef.current = next;
    setObjects(next);
  };

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage('Choose a tool and start creating!'), 2400);
  };

  const beginDrawing = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setDrawingActive(true);
  };

  const endDrawing = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setDrawingActive(false), 650);
  };

  const chooseTool = (nextTool: Tool) => {
    setTool(nextTool);
    setPanel(null);
    setDrawingActive(false);
    if (nextTool !== 'brush' && nextTool !== 'eraser') setBrushCursor(null);
    activeRegionMaskRef.current = null;
    haptic(6);
  };

  const toggleStayInLines = () => {
    const next = !stayInLines;
    setStayInLines(next);
    setTool('brush');
    activeRegionMaskRef.current = null;
    haptic(next ? [8, 30, 8] : 6);
    notify(next ? 'Stay Inside Lines on • Start inside any section' : 'Free drawing mode on');
  };

  const toggleFocusMode = async () => {
    const entering = !focusMode;
    setFocusMode(entering);
    if (!entering) setShowIosFocusHelp(false);
    setPanel(null);
    setDrawingActive(false);
    haptic(entering ? [8, 35, 8] : 6);
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = navigatorWithStandalone.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    try {
      if (entering && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      if (!entering && document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch { /* iOS Safari does not offer arbitrary-page fullscreen; the Home Screen app does. */ }
    if (entering && isIos && !isStandalone && !document.fullscreenElement) setShowIosFocusHelp(true);
  };

  const selectBrush = (nextBrush: BrushType) => {
    const preset = brushPresets.find((brush) => brush.id === nextBrush);
    setBrushType(nextBrush);
    setTool('brush');
    setDrawingActive(false);
    activeRegionMaskRef.current = null;
    haptic(7);
    setMessage(`${preset?.icon ?? '🖌️'} ${preset?.name ?? 'Brush'} selected`);
  };

  const drawLine = (from: Point, to: Point, pointerType = 'touch', pressure = 1) => {
    const backing = backingRef.current;
    const context = backing?.getContext('2d');
    if (!context || !backing) return;
    const pressureScale = pointerType === 'pen' ? .3 + Math.max(.05, pressure) * .7 : 1;
    const lineWidth = brushSize * pressureScale;
    const alpha = Math.max(.03, opacity * flow);
    const mask = stayInLines ? activeRegionMaskRef.current : null;
    if (tool === 'eraser') {
      const base = baseCanvasRef.current;
      if (!base) return;
      const scratch = scratchCanvasRef.current ?? document.createElement('canvas');
      scratchCanvasRef.current = scratch;
      restoreBaseLine({ backing, base, mask, scratch, from, to, lineWidth, alpha });
    } else {
      const scratch = scratchCanvasRef.current ?? document.createElement('canvas');
      scratchCanvasRef.current = scratch;
      drawBrushStroke({ backing, mask, scratch, from, to, color, size: lineWidth, alpha, type: brushType });
    }
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

  const normalizeRotation = (angle: number) => {
    const fullTurn = Math.PI * 2;
    return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  };

  const rotateCanvas = (quarterTurns: number) => {
    setCanvasRotation((angle) => normalizeRotation(angle + quarterTurns * Math.PI / 2));
    setZoom(1);
    setPan({ x: 0, y: 0 });
    haptic(8);
    notify(`Canvas rotated ${quarterTurns < 0 ? 'left' : 'right'} 90°`);
  };

  const resetCanvasRotation = () => {
    setCanvasRotation(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    haptic(6);
    notify('Canvas returned upright');
  };

  const constrainPan = (nextZoom: number, nextPan: Point) => {
    const maxX = (nextZoom - 1) * 360;
    const maxY = (nextZoom - 1) * 280;
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  };

  const wheelCanvas = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : 1;
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = Math.max(1, Math.min(4, zoom * Math.exp(-event.deltaY * unit * .008)));
      setZoom(nextZoom);
      setPan(constrainPan(nextZoom, pan));
      setMessage(`Canvas zoom ${Math.round(nextZoom * 100)}%`);
      return;
    }
    if (zoom > 1) {
      setPan(constrainPan(zoom, { x: pan.x - event.deltaX * unit, y: pan.y - event.deltaY * unit }));
      setMessage('Trackpad pan • pinch or Ctrl-wheel to zoom');
    }
  };

  const fillAt = (point: Point, fillColor = color) => {
    const target = hitObject(objectsRef.current, point);
    if (target) {
      updateObjects((items) => items.map((item) => item.id === target.id ? { ...item, color: fillColor } : item));
      setSelectedId(target.id);
      pushHistory();
      haptic(10);
      notify('Object colored!');
      return;
    }
    if (backingRef.current && fillRegion(backingRef.current, point, fillColor, tolerance)) {
      setRevision((value) => value + 1);
      window.setTimeout(pushHistory);
      haptic(10);
      notify('Area filled!');
    } else notify('Try another enclosed area');
  };

  const clearFillPreview = () => {
    const preview = fillPreviewCanvasRef.current;
    preview?.getContext('2d')?.clearRect(0, 0, preview.width, preview.height);
    fillPreviewTargetRef.current = null;
    setFillPreviewActive(false);
  };

  const previewColorDrop = (clientX: number, clientY: number, previewColor: string) => {
    const canvas = visibleRef.current;
    const backing = backingRef.current;
    const preview = fillPreviewCanvasRef.current;
    if (!canvas || !backing || !preview) {
      clearFillPreview();
      return;
    }
    const point = pointFromClient(canvas, clientX, clientY, true);
    if (!point) {
      clearFillPreview();
      return;
    }

    if (preview.width !== backing.width || preview.height !== backing.height) {
      preview.width = backing.width;
      preview.height = backing.height;
      fillPreviewTargetRef.current = null;
    }
    const object = hitObject(objectsRef.current, point);
    const base = baseCanvasRef.current ?? copyCanvas(backing);
    baseCanvasRef.current = base;
    const cache = regionMaskCacheRef.current ?? createRegionMaskCache(base);
    regionMaskCacheRef.current = cache;
    const mask = object ? null : cache ? getRegionMask(cache, point) : null;
    const target = object ? `object:${object.id}` : mask;
    if (!target) {
      clearFillPreview();
      return;
    }
    if (fillPreviewTargetRef.current === target) return;

    const context = preview.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, preview.width, preview.height);
    context.save();
    context.globalCompositeOperation = 'source-over';
    if (object) {
      context.globalAlpha = .28;
      drawObject(context, { ...object, color: previewColor });
    } else if (mask) {
      context.globalAlpha = .24;
      context.fillStyle = previewColor;
      context.fillRect(0, 0, preview.width, preview.height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask, 0, 0);
    }
    context.restore();
    fillPreviewTargetRef.current = target;
    setFillPreviewActive(true);
    setMessage('Release to fill the highlighted section');
  };

  const startCanvasNavigation = () => {
    if (screenPointers.current.size < 2 || navigatingCanvas.current) return;
    if (strokeStarted.current) pushHistory();
    activeRegionMaskRef.current = null;
    const [a, b] = [...screenPointers.current.values()];
    viewGesture.current = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom,
      pan: { ...pan },
      rotation: canvasRotation,
    };
    lastPoint.current = null;
    strokeStarted.current = false;
    fillTap.current = null;
    fillTapMoved.current = true;
    navigatingCanvas.current = true;
    multiTouch.current = {
      startedAt: Date.now(),
      maxPointers: screenPointers.current.size,
      moved: false,
      initial: new Map(screenPointers.current),
    };
    setBrushCursor(null);
    setMessage('Pinch, drag or twist anywhere around the canvas');
  };

  const stagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewPointerOnCanvas.current.set(event.pointerId, Boolean((event.target as Element | null)?.closest('.canvas-wrap')));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue tracking through bubbling when capture is unavailable. */ }
    const startedOutsideCanvas = [...viewPointerOnCanvas.current.values()].some((inside) => !inside);
    if (screenPointers.current.size === 2 && (tool !== 'move' || !selectedId || startedOutsideCanvas)) startCanvasNavigation();
    if (screenPointers.current.size > 2 && multiTouch.current) multiTouch.current.maxPointers = screenPointers.current.size;
  };

  const stagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!screenPointers.current.has(event.pointerId)) return;
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!navigatingCanvas.current || screenPointers.current.size < 2) return;
    event.preventDefault();
    const [a, b] = [...screenPointers.current.values()];
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (multiTouch.current) {
      multiTouch.current.maxPointers = Math.max(multiTouch.current.maxPointers, screenPointers.current.size);
      const initial = [...multiTouch.current.initial.values()];
      if (initial.length >= 2) {
        const [initialA, initialB] = initial;
        const initialDistance = Math.hypot(initialB.x - initialA.x, initialB.y - initialA.y);
        const initialAngle = Math.atan2(initialB.y - initialA.y, initialB.x - initialA.x);
        const initialCenter = { x: (initialA.x + initialB.x) / 2, y: (initialA.y + initialB.y) / 2 };
        if (Math.abs(distance - initialDistance) > 8 || Math.abs(angle - initialAngle) > .05 || Math.hypot(center.x - initialCenter.x, center.y - initialCenter.y) > 8) multiTouch.current.moved = true;
      }
    }
    if (!viewGesture.current) return;
    const nextZoom = Math.max(1, Math.min(4, viewGesture.current.zoom * distance / viewGesture.current.distance));
    setZoom(nextZoom);
    setCanvasRotation(normalizeRotation(viewGesture.current.rotation + angle - viewGesture.current.angle));
    setPan(constrainPan(nextZoom, {
      x: viewGesture.current.pan.x + center.x - viewGesture.current.center.x,
      y: viewGesture.current.pan.y + center.y - viewGesture.current.center.y,
    }));
  };

  const stagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !screenPointers.current.has(event.pointerId)) return;
    screenPointers.current.delete(event.pointerId);
    viewPointerOnCanvas.current.delete(event.pointerId);
    if (screenPointers.current.size < 2) viewGesture.current = null;
    if (screenPointers.current.size || !navigatingCanvas.current) return;
    const touchGesture = multiTouch.current;
    const isQuickTap = touchGesture && !touchGesture.moved && Date.now() - touchGesture.startedAt < 320;
    multiTouch.current = null;
    navigatingCanvas.current = false;
    pointers.current.clear();
    lastPoint.current = null;
    strokeStarted.current = false;
    fillTap.current = null;
    fillTapMoved.current = false;
    activeRegionMaskRef.current = null;
    if (isQuickTap && touchGesture.maxPointers >= 3) {
      redo();
      notify('Redo');
    } else if (isQuickTap && touchGesture.maxPointers === 2) {
      undo();
      notify('Undo');
    } else {
      notify(`Canvas ${Math.round(zoom * 100)}% • ${Math.round(canvasRotation * 180 / Math.PI)}°`);
    }
    endDrawing();
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse' && event.button === 2) return;
    if (navigatingCanvas.current) return;
    const point = pointFromClient(canvas, event.clientX, event.clientY)!;
    if (tool === 'brush' || tool === 'eraser') setBrushCursor(point);
    pointers.current.set(event.pointerId, point);

    if ((event.button === 1 || (spaceHeld.current && event.button === 0)) && event.pointerType === 'mouse') {
      mousePan.current = { point: { x: event.clientX, y: event.clientY }, pan: { ...pan } };
      return;
    }

    if (tool === 'fill') {
      fillTap.current = point;
      fillTapMoved.current = false;
      return;
    }
    if (tool === 'move') {
      if (pointers.current.size > 1 && selectedId) return;
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (event.pointerType === 'mouse' && selected && hitRotateHandle(selected, point)) {
        mouseRotate.current = {
          id: selected.id,
          angle: Math.atan2(point.y - selected.y, point.x - selected.x),
          rotation: selected.rotation,
        };
        mouseResize.current = null;
        dragOffset.current = null;
        notify('Drag around the object to rotate');
        return;
      }
      if (event.pointerType === 'mouse' && selected && hitResizeHandle(selected, point)) {
        mouseResize.current = {
          id: selected.id,
          distance: Math.max(1, Math.hypot(point.x - selected.x, point.y - selected.y)),
          width: selected.width,
          height: selected.height,
        };
        dragOffset.current = null;
        return;
      }
      const target = hitObject(objectsRef.current, point);
      if (target) {
        setSelectedId(target.id);
        dragOffset.current = { x: point.x - target.x, y: point.y - target.y };
        notify('Move • corner resize • top handle rotates • two-finger twist');
      } else {
        setSelectedId(null);
        dragOffset.current = null;
      }
      return;
    }
    if (pointers.current.size === 1) {
      if (stayInLines && (tool === 'brush' || tool === 'eraser')) {
        const baseCanvas = baseCanvasRef.current ?? (backingRef.current ? copyCanvas(backingRef.current) : null);
        if (!baseCanvas) {
          notify('The page is still getting ready');
          lastPoint.current = null;
          return;
        }
        baseCanvasRef.current = baseCanvas;
        const cache = regionMaskCacheRef.current ?? createRegionMaskCache(baseCanvas);
        regionMaskCacheRef.current = cache;
        const mask = cache ? getRegionMask(cache, point) : null;
        if (!mask) {
          notify('Start the brush inside a section, away from the black line');
          lastPoint.current = null;
          return;
        }
        activeRegionMaskRef.current = mask;
        setMessage('✨ Painting only inside this section');
      }
      lastPoint.current = point;
      strokeStarted.current = false;
      beginDrawing();
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromClient(event.currentTarget, event.clientX, event.clientY)!;
    if (tool === 'brush' || tool === 'eraser') setBrushCursor(point);
    if (navigatingCanvas.current) return;
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, point);

    if (mousePan.current) {
      setPan(constrainPan(zoom, {
        x: mousePan.current.pan.x + event.clientX - mousePan.current.point.x,
        y: mousePan.current.pan.y + event.clientY - mousePan.current.point.y,
      }));
      return;
    }

    if (tool === 'fill' && fillTap.current && Math.hypot(point.x - fillTap.current.x, point.y - fillTap.current.y) > 12) {
      fillTapMoved.current = true;
      return;
    }

    if (tool === 'move' && selectedId) {
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (!selected) return;
      if (mouseRotate.current && event.pointerType === 'mouse') {
        const angle = Math.atan2(point.y - selected.y, point.x - selected.x);
        updateObjects((items) => items.map((item) => item.id === mouseRotate.current!.id ? {
          ...item,
          rotation: mouseRotate.current!.rotation + angle - mouseRotate.current!.angle,
        } : item));
        objectChanged.current = true;
        return;
      }
      if (mouseResize.current && event.pointerType === 'mouse') {
        const scale = Math.max(.25, Math.min(5, Math.hypot(point.x - selected.x, point.y - selected.y) / mouseResize.current.distance));
        updateObjects((items) => items.map((item) => item.id === mouseResize.current!.id ? {
          ...item,
          width: Math.max(70, mouseResize.current!.width * scale),
          height: Math.max(70, mouseResize.current!.height * scale),
        } : item));
        objectChanged.current = true;
        return;
      }
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
          x: Math.max(item.width / 2, Math.min(canvasSize.width - item.width / 2, point.x - dragOffset.current!.x)),
          y: Math.max(item.height / 2, Math.min(canvasSize.height - item.height / 2, point.y - dragOffset.current!.y)),
        } : item));
        objectChanged.current = true;
      }
      return;
    }
    if ((tool === 'brush' || tool === 'eraser') && lastPoint.current && pointers.current.size === 1) {
      const response = 1 - smoothing * .82;
      const smoothedPoint = {
        x: lastPoint.current.x + (point.x - lastPoint.current.x) * response,
        y: lastPoint.current.y + (point.y - lastPoint.current.y) * response,
      };
      drawLine(lastPoint.current, smoothedPoint, event.pointerType, event.pressure || 1);
      lastPoint.current = smoothedPoint;
    }
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hadMultiplePointers = screenPointers.current.size > 1;
    const releasedPoint = pointers.current.get(event.pointerId) ?? null;
    pointers.current.delete(event.pointerId);
    if (navigatingCanvas.current) {
      if (event.pointerType === 'touch') setBrushCursor(null);
      return;
    }
    if (mousePan.current) {
      mousePan.current = null;
      if (!screenPointers.current.size) notify(`Canvas zoom ${Math.round(zoom * 100)}%`);
      return;
    }

    if (tool === 'fill' && fillTap.current && !fillTapMoved.current && !hadMultiplePointers) {
      fillAt(fillTap.current);
    }
    if (!pointers.current.size) {
      if ((tool === 'brush' || tool === 'eraser') && lastPoint.current && !strokeStarted.current && releasedPoint && !hadMultiplePointers) {
        drawLine(lastPoint.current, { x: lastPoint.current.x + .1, y: lastPoint.current.y + .1 }, event.pointerType, event.pressure || 1);
      } else if ((tool === 'brush' || tool === 'eraser') && lastPoint.current && strokeStarted.current && releasedPoint && !hadMultiplePointers) {
        drawLine(lastPoint.current, releasedPoint, event.pointerType, event.pressure || 1);
      }
      if ((tool === 'brush' || tool === 'eraser') && strokeStarted.current) pushHistory();
      if (tool === 'move' && objectChanged.current) pushHistory();
      lastPoint.current = null;
      strokeStarted.current = false;
      fillTap.current = null;
      fillTapMoved.current = false;
      dragOffset.current = null;
      mouseResize.current = null;
      mouseRotate.current = null;
      gesture.current = null;
      activeRegionMaskRef.current = null;
      objectChanged.current = false;
      endDrawing();
    }
    if (event.pointerType === 'touch') setBrushCursor(null);
  };

  const undo = () => {
    if (history.current.length <= 1) return;
    future.current.push(history.current.pop()!);
    const previous = history.current.at(-1)!;
    applySnapshot(previous);
    void saveCurrentArtwork(previous).catch(() => undefined);
    refreshHistoryState();
    haptic(8);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(next);
    applySnapshot(next);
    void saveCurrentArtwork(next).catch(() => undefined);
    refreshHistoryState();
    haptic([7, 25, 7]);
  };

  const addObject = (kind: ArtObject['kind'], sticker?: string) => {
    const object = newObject(kind, color, sticker, canvasSize.width, canvasSize.height);
    updateObjects((items) => [...items, object]);
    setSelectedId(object.id);
    setTool('move');
    setPanel(null);
    pushHistory();
    haptic(10);
    notify('Move • resize corners • rotate the top handle or twist');
  };

  const rotateSelected = () => {
    if (!selectedId) return;
    updateObjects((items) => items.map((item) => item.id === selectedId ? { ...item, rotation: item.rotation + Math.PI / 12 } : item));
    pushHistory();
    haptic(7);
    notify('Object rotated 15°');
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateObjects((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
    pushHistory();
    haptic(8);
    notify('Object removed');
  };

  const clearArt = () => {
    const backing = backingRef.current;
    const context = backing?.getContext('2d');
    if (!context || !backing) return;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, backing.width, backing.height);
    capturePageBase(backing);
    objectsRef.current = [];
    setObjects([]);
    setSelectedId(null);
    setRevision((value) => value + 1);
    window.setTimeout(pushHistory);
    notify('Fresh canvas ready');
  };

  const resetPage = () => {
    const backing = backingRef.current;
    const base = pageBaseRef.current;
    if (!backing || !base) return;
    const image = new Image();
    image.onload = () => {
      backing.width = base.width;
      backing.height = base.height;
      const context = backing.getContext('2d');
      if (!context) return;
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, base.width, base.height);
      context.drawImage(image, 0, 0, base.width, base.height);
      objectsRef.current = [];
      setObjects([]);
      setSelectedId(null);
      setCanvasSize({ width: base.width, height: base.height });
      setRevision((value) => value + 1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setCanvasRotation(0);
      setPanel(null);
      window.setTimeout(pushHistory);
      haptic([8, 35, 8]);
      notify('Page reset • Undo brings your work back');
    };
    image.src = base.bitmap;
  };

  const placeImage = (image: HTMLImageElement, successMessage: string) => {
      const backing = backingRef.current;
      if (!backing) return;
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longestSide > 1600 ? 1600 / longestSide : longestSide < 900 ? 900 / longestSide : 1;
      const padding = 28;
      const imageWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const imageHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      const width = imageWidth + padding * 2;
      const height = imageHeight + padding * 2;
      backing.width = width;
      backing.height = height;
      const context = backing.getContext('2d');
      if (!context) return;
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, padding, padding, imageWidth, imageHeight);
      context.strokeStyle = '#171823';
      context.lineWidth = 10;
      context.strokeRect(padding - 5, padding - 5, imageWidth + 10, imageHeight + 10);
      capturePageBase(backing);
      setCanvasSize({ width, height });
      objectsRef.current = [];
      setObjects([]);
      setSelectedId(null);
      setRevision((value) => value + 1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setCanvasRotation(0);
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
    output.width = backingRef.current?.width ?? canvasSize.width;
    output.height = backingRef.current?.height ?? canvasSize.height;
    const context = output.getContext('2d')!;
    context.drawImage(backingRef.current!, 0, 0);
    objectsRef.current.forEach((object) => drawObject(context, object));
    const link = document.createElement('a');
    link.download = `color-pop-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
    notify('Artwork saved as PNG');
  };

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.code === 'Space' && !isTyping) {
        spaceHeld.current = true;
        event.preventDefault();
        return;
      }
      if (isTyping) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (modifier && key === 's') {
        event.preventDefault();
        save();
      } else if (key === 'b') chooseTool('brush');
      else if (key === 'e') chooseTool('eraser');
      else if (key === 'f') chooseTool('fill');
      else if (key === 'v') chooseTool('move');
      else if (key === '[') setBrushSize((value) => Math.max(BRUSH_MIN, value - 3));
      else if (key === ']') setBrushSize((value) => Math.min(BRUSH_MAX, value + 3));
      else if (key === '0') resetView();
      else if (key === 'r') resetPage();
      else if (key === 'm') toggleStayInLines();
      else if (key === 'h') void toggleFocusMode();
      else if (key === 'l') setLeftHanded((value) => !value);
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); deleteSelected(); }
      else if (event.key === 'Escape') {
        setPanel(null);
        if (focusMode) void toggleFocusMode();
      }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  });

  const startColorDrag = (event: React.PointerEvent, swatchColor: string) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const pointerType = event.pointerType;
    const verticalPalette = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    const source = event.currentTarget as HTMLElement;
    const paletteScroller = source.closest<HTMLElement>('.palette__scroller');
    let filling = false;
    let scrolling = false;
    let lastX = startX;
    let lastY = startY;
    if (verticalPalette && pointerType === 'touch') event.preventDefault();
    try { source.setPointerCapture(pointerId); } catch { /* Window listeners still keep the drag reliable. */ }
    setBrushCursor(null);
    const activateFill = () => {
      if (filling || scrolling) return;
      filling = true;
      setColor(swatchColor);
      setTool('fill');
      setPanel(null);
      setDrawingActive(false);
      haptic([8, 28, 8]);
      const fingerLift = pointerType === 'touch' ? 48 : 0;
      setDragColor({ color: swatchColor, x: lastX - (verticalPalette ? fingerLift : 0), y: lastY - (verticalPalette ? 0 : fingerLift) });
      setMessage('ColorDrop ready • drag to a section and release');
    };
    const holdTimer = window.setTimeout(activateFill, pointerType === 'touch' ? 340 : 420);
    const clearHold = () => window.clearTimeout(holdTimer);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const previousY = lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const distance = Math.hypot(deltaX, deltaY);
      const paletteScroll = verticalPalette
        ? Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        : Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
      if (!filling && !scrolling && pointerType === 'touch' && paletteScroll) {
        scrolling = true;
        clearHold();
        if (verticalPalette && paletteScroller) paletteScroller.scrollTop -= deltaY;
      } else if (scrolling && verticalPalette && paletteScroller) {
        paletteScroller.scrollTop -= moveEvent.clientY - previousY;
      }
      if (scrolling) {
        if (verticalPalette) moveEvent.preventDefault();
        return;
      }
      const draggedTowardCanvas = verticalPalette
        ? deltaX < -8 && Math.abs(deltaX) > Math.abs(deltaY) * .55
        : deltaY < -8 && Math.abs(deltaY) > Math.abs(deltaX) * .55;
      if (!filling && !scrolling && (pointerType !== 'touch' ? distance > 6 : draggedTowardCanvas)) {
        activateFill();
      }
      if (filling) {
        moveEvent.preventDefault();
        const fingerLift = pointerType === 'touch' ? 48 : 0;
        setDragColor({ color: swatchColor, x: moveEvent.clientX - (verticalPalette ? fingerLift : 0), y: moveEvent.clientY - (verticalPalette ? 0 : fingerLift) });
        previewColorDrop(moveEvent.clientX, moveEvent.clientY, swatchColor);
      }
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      clearHold();
      setDragColor(null);
      clearFillPreview();
      if (scrolling) return;
      if (!filling) { setColor(swatchColor); haptic(5); return; }
      const canvas = visibleRef.current;
      const dropPoint = canvas ? pointFromClient(canvas, upEvent.clientX, upEvent.clientY, true) : null;
      if (dropPoint) {
        fillAt(dropPoint, swatchColor);
      } else notify('Drop the color inside the canvas');
    };
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      clearHold();
      setDragColor(null);
      clearFillPreview();
    };
    document.addEventListener('pointermove', move, { capture: true, passive: false });
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  };

  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;

  return (
    <main className={`app-shell${focusMode ? ' is-focus' : ''}${drawingActive ? ' is-drawing' : ''}${leftHanded ? ' is-left-handed' : ''}${stayInLines ? ' is-line-safe' : ''}`}>
      <header className="topbar">
        <div className="brand"><span className="brand__mark" aria-hidden="true">✦</span><span>Color Pop</span></div>
        <div className="topbar__actions">
          <IconButton icon="↶" label="Undo" disabled={!historyState.undo} onClick={undo} />
          <IconButton icon="↷" label="Redo" disabled={!historyState.redo} onClick={redo} />
          <IconButton icon="⛶" label={focusMode ? 'Exit focus mode' : 'Enter focus mode'} active={focusMode} onClick={() => void toggleFocusMode()} />
          <button className="library-button" type="button" onClick={() => setPanel('library')}><span aria-hidden="true">▦</span><b>Drawings</b></button>
          <button className="gallery-button" type="button" onClick={() => setPanel(panel === 'actions' ? null : 'actions')}><span aria-hidden="true">•••</span><b>Actions</b></button>
        </div>
      </header>

      <section className="workspace" onWheel={wheelCanvas}>
        <div className="workspace-hud">
          <div className="status-pill" role="status">{message}</div>
          {stayInLines && <div className="line-mode-badge"><ToolIcon name="magic" size={16} /><span>Stay Inside Lines</span></div>}
          {selectedObject && <div className="selection-toolbar" aria-label="Selected object controls">
            <span>{Math.round(selectedObject.width)} × {Math.round(selectedObject.height)} • {Math.round(selectedObject.rotation * 180 / Math.PI)}°</span>
            <button className="rotate-selection" type="button" onClick={rotateSelected} aria-label="Rotate selected object 15 degrees">↻</button>
            <button className="delete-selection" type="button" onClick={deleteSelected} aria-label="Delete selected object">×</button>
          </div>}
          <div className="view-controls" aria-label="Canvas view controls">
            <button type="button" onClick={() => rotateCanvas(-1)} aria-label="Rotate canvas left 90 degrees">↶<span>90°</span></button>
            <button className="rotation-reset" type="button" onClick={resetCanvasRotation} aria-label="Reset canvas rotation">{Math.round(canvasRotation * 180 / Math.PI)}°</button>
            <button type="button" onClick={() => rotateCanvas(1)} aria-label="Rotate canvas right 90 degrees">↷<span>90°</span></button>
            <button className="zoom-reset" type="button" onClick={resetView} aria-label="Fit canvas to screen">Fit {Math.round(zoom * 100)}%</button>
          </div>
        </div>
        <div
          className="canvas-stage"
          onPointerDownCapture={stagePointerDown}
          onPointerMoveCapture={stagePointerMove}
          onPointerUp={stagePointerUp}
          onPointerCancel={stagePointerUp}
        >
          <div className="canvas-cluster" ref={clusterRef}>
            <aside className="side-controls" ref={sizeControlRef} aria-label="Brush size">
              <span className="control-icon"><ToolIcon name="brush" size={17} /></span>
              <button className="control-value" type="button" aria-label="Open brush settings" onClick={() => setPanel(panel === 'brush' ? null : 'brush')}>{brushSize}<small>px</small></button>
              <VerticalRange label="Brush size" minimum={BRUSH_MIN} maximum={BRUSH_MAX} value={brushSize} onChange={setBrushSize} />
              <span className="control-label">Size</span>
            </aside>
            <div className="canvas-wrap" style={{ '--page-ratio': canvasSize.width / canvasSize.height, width: displaySize?.width, height: displaySize?.height, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${canvasRotation}rad)` } as React.CSSProperties}>
              <canvas
                ref={visibleRef} width={canvasSize.width} height={canvasSize.height} aria-label="Drawing canvas"
                className={tool === 'move' ? 'is-move-tool' : ''}
                onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
                onPointerEnter={(event) => { if (tool === 'brush' || tool === 'eraser') setBrushCursor(pointFromClient(event.currentTarget, event.clientX, event.clientY)); }}
                onPointerLeave={() => { if (!pointers.current.size) setBrushCursor(null); }}
                onDoubleClick={resetView} onContextMenu={(event) => event.preventDefault()}
              />
              <canvas ref={fillPreviewCanvasRef} className={`fill-preview-canvas${fillPreviewActive ? ' is-active' : ''}`} width={canvasSize.width} height={canvasSize.height} aria-hidden="true" />
              {brushCursor && (tool === 'brush' || tool === 'eraser') && <span
                className={`brush-size-outline${tool === 'eraser' ? ' is-eraser' : ''}`}
                style={{
                  left: `${brushCursor.x / canvasSize.width * 100}%`,
                  top: `${brushCursor.y / canvasSize.height * 100}%`,
                  width: Math.max(5, brushSize * (displaySize?.width ?? canvasSize.width) / canvasSize.width),
                  height: Math.max(5, brushSize * (displaySize?.width ?? canvasSize.width) / canvasSize.width),
                }}
                aria-hidden="true"
              />}
            </div>
            <aside className="side-controls side-controls--right" ref={opacityControlRef} aria-label="Brush opacity">
              <span className="control-icon"><ToolIcon name="droplet" size={17} /></span>
              <button className="control-value" type="button" aria-label="Open brush settings" onClick={() => setPanel(panel === 'brush' ? null : 'brush')}>{Math.round(opacity * 100)}<small>%</small></button>
              <VerticalRange label="Brush opacity" minimum={10} maximum={100} value={opacity * 100} onChange={(value) => setOpacity(value / 100)} />
              <span className="control-label">Opacity</span>
            </aside>
          </div>
        </div>
      </section>

      <nav className="tool-dock" aria-label="Drawing tools">
        <IconButton icon={<ToolIcon name="brush" />} label="Choose brush" active={tool === 'brush' || panel === 'brush'} onClick={() => { chooseTool('brush'); setPanel(panel === 'brush' ? null : 'brush'); }} />
        <IconButton icon={<ToolIcon name="magic" />} label="Stay inside lines" active={stayInLines} className="line-safe-tool" onClick={toggleStayInLines} />
        <IconButton icon={<ToolIcon name="eraser" />} label="Eraser" active={tool === 'eraser'} onClick={() => chooseTool('eraser')} />
        <IconButton icon={<ToolIcon name="fill" />} label="Fill bucket" active={tool === 'fill'} onClick={() => { chooseTool('fill'); notify('Tap an area, or drag a color onto it'); }} />
        <IconButton icon={<ToolIcon name="move" />} label="Move objects" active={tool === 'move'} onClick={() => chooseTool('move')} />
        <IconButton icon={<ToolIcon name="shapes" />} label="Shapes" active={panel === 'shapes'} onClick={() => setPanel(panel === 'shapes' ? null : 'shapes')} />
        <IconButton icon={<ToolIcon name="sticker" />} label="Stickers" active={panel === 'stickers'} onClick={() => setPanel(panel === 'stickers' ? null : 'stickers')} />
        <IconButton icon={<ToolIcon name="reset" />} label="Reset page" className="reset-tool" onClick={resetPage} />
      </nav>

      {panel === 'brush' && <section className="popover brush-popover" role="dialog" aria-label="Brush settings">
        <header><div><strong>Brush studio</strong><small>Pick a favorite or paint with magic</small></div><button type="button" aria-label="Close brush settings" onClick={() => setPanel(null)}>×</button></header>
        <div className="brush-library" aria-label="Brush types">
          {(['Favorites', 'Paint & texture', 'Magic'] as const).map((group) => <section className="brush-group" key={group}>
            <h3>{group}</h3>
            <div className="brush-grid">
              {brushPresets.filter((brush) => brush.group === group).map((brush) => <button
                key={brush.id}
                className={`brush-card${brushType === brush.id ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={brushType === brush.id}
                onClick={() => selectBrush(brush.id)}
              >
                <span className="brush-card__icon" aria-hidden="true">{brush.icon}</span>
                <span><b>{brush.name}</b><small>{brush.description}</small></span>
              </button>)}
            </div>
          </section>)}
        </div>
        <button className={`line-mode-setting${stayInLines ? ' is-on' : ''}`} type="button" aria-pressed={stayInLines} onClick={toggleStayInLines}>
          <ToolIcon name="magic" size={23} /><span><b>Stay Inside Lines</b><small>Paint only inside the section you touch</small></span><em>{stayInLines ? 'On' : 'Off'}</em>
        </button>
        <div className="brush-preview"><BrushStrokePreview type={brushType} color={color} size={brushSize} alpha={Math.max(.12, opacity * flow)} /></div>
        <label><span><b>Size</b><em>{brushSize}px</em></span><input className="polished-range" style={rangeStyle(brushSize, BRUSH_MIN, BRUSH_MAX)} type="range" min={BRUSH_MIN} max={BRUSH_MAX} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
        <label><span><b>Opacity</b><em>{Math.round(opacity * 100)}%</em></span><input className="polished-range" style={rangeStyle(opacity * 100, 10, 100)} type="range" min="10" max="100" value={opacity * 100} onChange={(event) => setOpacity(Number(event.target.value) / 100)} /></label>
        <label><span><b>Flow</b><em>{Math.round(flow * 100)}%</em></span><input className="polished-range" style={rangeStyle(flow * 100, 5, 100)} type="range" min="5" max="100" value={flow * 100} onChange={(event) => setFlow(Number(event.target.value) / 100)} /></label>
        <label><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input className="polished-range" style={rangeStyle(smoothing * 100, 0, 90)} type="range" min="0" max="90" value={smoothing * 100} onChange={(event) => setSmoothing(Number(event.target.value) / 100)} /></label>
      </section>}

      {panel === 'shapes' && <div className="popover shapes-popover">
        <button onClick={() => addObject('rectangle')}>▰<span>Rectangle</span></button>
        <button onClick={() => addObject('circle')}>●<span>Circle</span></button>
        <button onClick={() => addObject('star')}>★<span>Star</span></button>
      </div>}
      {panel === 'stickers' && <div className="popover sticker-popover">{stickers.map((item) => <button key={item} onClick={() => addObject('sticker', item)}>{item}</button>)}</div>}
      {panel === 'actions' && <div className="popover actions-popover">
        <button type="button" onClick={() => fileRef.current?.click()}>⬆️ <span>Upload picture</span></button>
        <button type="button" onClick={save}>⬇️ <span>Save PNG</span></button>
        <button type="button" onClick={toggleStayInLines}><ToolIcon name="magic" size={21} /> <span>{stayInLines ? 'Free drawing mode' : 'Stay inside lines'}</span></button>
        <button type="button" onClick={resetPage}><ToolIcon name="reset" size={21} /> <span>Reset page</span></button>
        <button type="button" onClick={clearArt}>✨ <span>New canvas</span></button>
        <button type="button" onClick={() => void toggleFocusMode()}>⛶ <span>{focusMode ? 'Exit focus mode' : 'Focus mode'}</span></button>
        <button type="button" onClick={() => { setLeftHanded((value) => !value); haptic(8); }}>↔️ <span>{leftHanded ? 'Right-handed layout' : 'Left-handed layout'}</span></button>
        <label>Fill tolerance <b>{tolerance}</b><input type="range" min="5" max="80" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
        <div className="input-hints"><span>✨ Stay Inside Lines locks paint to one section</span><span>🎨 Hold a color to start ColorDrop</span><span>✌️ Pinch to zoom • twist to rotate</span><span>🖱 Ctrl-wheel zoom • Space-drag pan</span></div>
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
          <div className="category-heading category-heading--magic"><span>🦄</span><div><h3>Unicorns &amp; Princesses</h3><p>Magical friends and underwater adventures</p></div></div>
          <div className="drawing-grid drawing-grid--landscape">
            {unicornPrincessPages.map((page) => <button key={page.file} type="button" className="drawing-card" onClick={() => loadLibraryPage(page.src, page.title)}>
              <span className="drawing-card__preview"><img src={page.src} alt="" loading="lazy" /></span>
              <strong>{page.title}</strong>
              <small>Tap to color</small>
            </button>)}
          </div>
          <div className="category-heading category-heading--stitch"><span>🌺</span><div><h3>Stitch</h3><p>Eight playful adventures ready to color</p></div></div>
          <div className="drawing-grid drawing-grid--portrait">
            {stitchPages.map((page) => <button key={page.file} type="button" className="drawing-card" onClick={() => loadLibraryPage(page.src, page.title)}>
              <span className="drawing-card__preview"><img src={page.src} alt="" loading="lazy" /></span>
              <strong>{page.title}</strong>
              <small>Tap to color</small>
            </button>)}
          </div>
        </section>
      </div>}

      <footer className="palette" aria-label="Colors and magic brushes">
        <div className="palette__scroller">
          {magicBrushes.map((brush) => <button
            key={brush.id}
            type="button"
            className={`magic-brush-button${tool === 'brush' && brushType === brush.id ? ' is-selected' : ''}`}
            aria-label={`Select ${brush.name} brush`}
            title={`${brush.name} brush`}
            onClick={() => selectBrush(brush.id)}
          ><MagicBrushPreview type={brush.id} color={color} /></button>)}
          <span className="magic-brush-divider" aria-hidden="true" />
          {colors.map((swatchColor) => <button key={swatchColor} type="button" className={`swatch${color === swatchColor ? ' is-selected' : ''}`} style={{ backgroundColor: swatchColor }} aria-label={`Select or drag color ${swatchColor}`} onPointerDown={(event) => startColorDrag(event, swatchColor)} />)}
          <label className="swatch swatch--picker" aria-label="Choose a custom color">＋<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        </div>
      </footer>
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ''; }} />
      {showIosFocusHelp && <div className="ios-focus-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setShowIosFocusHelp(false); }}>
        <section className="ios-focus-help" role="dialog" aria-modal="true" aria-labelledby="ios-focus-title">
          <span className="ios-focus-help__icon" aria-hidden="true">↥</span>
          <div><span className="eyebrow">iPhone &amp; iPad</span><h2 id="ios-focus-title">Open truly full screen</h2></div>
          <p>Safari keeps its address bar and tabs visible. Tap <b>Share</b>, choose <b>Add to Home Screen</b>, then open <b>Color Pop</b> from its new icon.</p>
          <p className="ios-focus-help__note">Focus mode will then use the whole screen without Safari controls.</p>
          <button type="button" onClick={() => setShowIosFocusHelp(false)}>Got it</button>
        </section>
      </div>}
      {dragColor && <div className="color-drop-orb" style={{ left: dragColor.x, top: dragColor.y, backgroundColor: dragColor.color }} />}
    </main>
  );
}
