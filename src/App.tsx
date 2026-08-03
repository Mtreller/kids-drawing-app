import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ART_HEIGHT, ART_WIDTH, ArtObject, Point, Snapshot, Tool, canvasPoint,
  drawObject, fillRegion, hitObject, hitResizeHandle, newObject,
} from './drawing';
import { loadCurrentArtwork, saveCurrentArtwork } from './storage';

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
type MultiTouch = { startedAt: number; maxPointers: number; moved: boolean; initial: Map<number, Point> };
type MouseResize = { id: string; distance: number; width: number; height: number };

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
  const clusterRef = useRef<HTMLDivElement>(null);
  const sizeControlRef = useRef<HTMLElement>(null);
  const opacityControlRef = useRef<HTMLElement>(null);
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
  const multiTouch = useRef<MultiTouch | null>(null);
  const mousePan = useRef<{ point: Point; pan: Point } | null>(null);
  const mouseResize = useRef<MouseResize | null>(null);
  const spaceHeld = useRef(false);
  const hideTimer = useRef<number | null>(null);
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
  const [canvasSize, setCanvasSize] = useState({ width: ART_WIDTH, height: ART_HEIGHT });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'shapes' | 'stickers' | 'actions' | 'library' | null>(null);
  const [dragColor, setDragColor] = useState<DragColor>(null);
  const [message, setMessage] = useState('Choose a tool and start creating!');
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const [focusMode, setFocusMode] = useState(false);
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
    const fullscreenChanged = () => { if (!document.fullscreenElement) setFocusMode(false); };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    return () => document.removeEventListener('fullscreenchange', fullscreenChanged);
  }, []);
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  useLayoutEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    const measure = () => {
      const controls = [sizeControlRef.current, opacityControlRef.current].filter((element) => element && element.offsetWidth > 0) as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(cluster).columnGap) || 0;
      const availableWidth = Math.max(1, cluster.clientWidth - controls.reduce((sum, element) => sum + element.offsetWidth, 0) - gap * controls.length);
      const availableHeight = Math.max(1, cluster.clientHeight);
      const ratio = canvasSize.width / canvasSize.height;
      const width = Math.min(availableWidth, availableHeight * ratio);
      const height = width / ratio;
      setDisplaySize((current) => current && Math.abs(current.width - width) < .5 && Math.abs(current.height - height) < .5 ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cluster);
    if (sizeControlRef.current) observer.observe(sizeControlRef.current);
    if (opacityControlRef.current) observer.observe(opacityControlRef.current);
    return () => observer.disconnect();
  }, [canvasSize.width, canvasSize.height, focusMode]);

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

  const snapshot = useCallback((): Snapshot => ({
    bitmap: backingRef.current?.toDataURL('image/png') ?? '',
    objects: objectsRef.current.map((object) => ({ ...object })),
    width: backingRef.current?.width ?? ART_WIDTH,
    height: backingRef.current?.height ?? ART_HEIGHT,
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
      setCanvasSize({ width, height });
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
    history.current = [{ bitmap: backing.toDataURL('image/png'), objects: [], width: ART_WIDTH, height: ART_HEIGHT }];
    refreshHistoryState();
    setRevision(1);
    void loadCurrentArtwork().then((saved) => {
      if (!saved?.bitmap) return;
      history.current = [saved];
      applySnapshot(saved);
      setMessage('Your last drawing was restored');
    }).catch(() => undefined);
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
    haptic(6);
  };

  const toggleFocusMode = async () => {
    const entering = !focusMode;
    setFocusMode(entering);
    setPanel(null);
    setDrawingActive(false);
    haptic(entering ? [8, 35, 8] : 6);
    try {
      if (entering && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      if (!entering && document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch { /* iOS uses the distraction-free layout when browser fullscreen is unavailable. */ }
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

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse' && event.button === 2) return;
    const point = canvasPoint(canvas, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if ((event.button === 1 || (spaceHeld.current && event.button === 0)) && event.pointerType === 'mouse') {
      mousePan.current = { point: { x: event.clientX, y: event.clientY }, pan: { ...pan } };
      return;
    }

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
      multiTouch.current = {
        startedAt: Date.now(),
        maxPointers: 2,
        moved: false,
        initial: new Map(screenPointers.current),
      };
      setMessage('Pinch to zoom • drag two fingers to move');
      return;
    }

    if (screenPointers.current.size > 2 && multiTouch.current && tool !== 'move') {
      multiTouch.current.maxPointers = screenPointers.current.size;
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
        notify('Drag to move • drag a corner to resize');
      } else {
        setSelectedId(null);
        dragOffset.current = null;
      }
      return;
    }
    if (pointers.current.size === 1) {
      lastPoint.current = point;
      strokeStarted.current = false;
      beginDrawing();
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    screenPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (mousePan.current) {
      setPan(constrainPan(zoom, {
        x: mousePan.current.pan.x + event.clientX - mousePan.current.point.x,
        y: mousePan.current.pan.y + event.clientY - mousePan.current.point.y,
      }));
      return;
    }

    if (screenPointers.current.size >= 2 && tool !== 'move') {
      const active = [...screenPointers.current.values()];
      const [a, b] = active;
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (multiTouch.current) {
        multiTouch.current.maxPointers = Math.max(multiTouch.current.maxPointers, screenPointers.current.size);
        const originalA = multiTouch.current.initial.get([...screenPointers.current.keys()][0]);
        const originalB = multiTouch.current.initial.get([...screenPointers.current.keys()][1]);
        if (originalA && originalB) {
          const originalDistance = Math.hypot(originalB.x - originalA.x, originalB.y - originalA.y);
          const originalCenter = { x: (originalA.x + originalB.x) / 2, y: (originalA.y + originalB.y) / 2 };
          if (Math.abs(distance - originalDistance) > 8 || Math.hypot(center.x - originalCenter.x, center.y - originalCenter.y) > 8) multiTouch.current.moved = true;
        }
      }
      if (!viewGesture.current) viewGesture.current = { distance, center, zoom, pan: { ...pan } };
      const nextZoom = Math.max(1, Math.min(4, viewGesture.current.zoom * distance / viewGesture.current.distance));
      setZoom(nextZoom);
      setPan(constrainPan(nextZoom, {
        x: viewGesture.current.pan.x + center.x - viewGesture.current.center.x,
        y: viewGesture.current.pan.y + center.y - viewGesture.current.center.y,
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
      drawLine(lastPoint.current, point, event.pointerType, event.pressure || 1);
      lastPoint.current = point;
    }
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hadMultiplePointers = screenPointers.current.size > 1;
    const releasedPoint = pointers.current.get(event.pointerId) ?? null;
    pointers.current.delete(event.pointerId);
    screenPointers.current.delete(event.pointerId);
    if (mousePan.current) {
      mousePan.current = null;
      if (!screenPointers.current.size) notify(`Canvas zoom ${Math.round(zoom * 100)}%`);
      return;
    }
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
      mouseResize.current = null;
      gesture.current = null;
      objectChanged.current = false;
      const touchGesture = multiTouch.current;
      const isQuickTap = touchGesture && !touchGesture.moved && Date.now() - touchGesture.startedAt < 320;
      multiTouch.current = null;
      const wasNavigating = navigatingCanvas.current;
      navigatingCanvas.current = false;
      if (isQuickTap && touchGesture.maxPointers >= 3) {
        redo();
        notify('Redo');
      } else if (isQuickTap && touchGesture.maxPointers === 2) {
        undo();
        notify('Undo');
      } else if (wasNavigating) {
        notify(`Canvas zoom ${Math.round(zoom * 100)}%`);
      }
      endDrawing();
    }
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
    notify('Drag to move • drag a corner or pinch to resize');
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
    const context = backingRef.current?.getContext('2d');
    if (!context) return;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, backingRef.current!.width, backingRef.current!.height);
    objectsRef.current = [];
    setObjects([]);
    setSelectedId(null);
    setRevision((value) => value + 1);
    window.setTimeout(pushHistory);
    notify('Fresh canvas ready');
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
      setCanvasSize({ width, height });
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
      else if (key === '[') setBrushSize((value) => Math.max(3, value - 3));
      else if (key === ']') setBrushSize((value) => Math.min(90, value + 3));
      else if (key === '0') resetView();
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
      if (!moved) { setColor(swatchColor); haptic(5); return; }
      const canvas = visibleRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (canvas && rect && upEvent.clientX >= rect.left && upEvent.clientX <= rect.right && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
        fillAt(canvasPoint(canvas, upEvent.clientX, upEvent.clientY), swatchColor);
      } else notify('Drop the color inside the canvas');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;

  return (
    <main className={`app-shell${focusMode ? ' is-focus' : ''}${drawingActive ? ' is-drawing' : ''}${leftHanded ? ' is-left-handed' : ''}`}>
      <header className="topbar">
        <div className="brand"><span className="brand__mark" aria-hidden="true">✦</span><span>Color Pop</span></div>
        <div className="topbar__actions">
          <IconButton icon="↶" label="Undo" disabled={!historyState.undo} onClick={undo} />
          <IconButton icon="↷" label="Redo" disabled={!historyState.redo} onClick={redo} />
          <IconButton icon="⛶" label="Enter focus mode" active={focusMode} onClick={() => void toggleFocusMode()} />
          <button className="library-button" type="button" onClick={() => setPanel('library')}><span aria-hidden="true">▦</span><b>Drawings</b></button>
          <button className="gallery-button" type="button" onClick={() => setPanel(panel === 'actions' ? null : 'actions')}><span aria-hidden="true">•••</span><b>Actions</b></button>
        </div>
      </header>

      <section className="workspace" onWheel={wheelCanvas}>
        <div className="canvas-stage">
          <div className="canvas-cluster" ref={clusterRef}>
            <aside className="side-controls" ref={sizeControlRef} aria-label="Brush size">
              <span className="control-value">{brushSize}</span>
              <input aria-label="Brush size" type="range" min="3" max="90" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
              <span className="control-label">Size</span>
            </aside>
            <div className="canvas-wrap" style={{ '--page-ratio': canvasSize.width / canvasSize.height, width: displaySize?.width, height: displaySize?.height, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` } as React.CSSProperties}>
              <canvas
                ref={visibleRef} width={canvasSize.width} height={canvasSize.height} aria-label="Drawing canvas"
                className={tool === 'move' ? 'is-move-tool' : ''}
                onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
                onDoubleClick={resetView} onContextMenu={(event) => event.preventDefault()}
              />
              {selectedObject && <div className="selection-toolbar" aria-label="Selected object controls">
                <span>{Math.round(selectedObject.width)} × {Math.round(selectedObject.height)}</span>
                <button type="button" onClick={deleteSelected} aria-label="Delete selected object">×</button>
              </div>}
            </div>
            <aside className="side-controls side-controls--right" ref={opacityControlRef} aria-label="Brush opacity">
              <span className="control-value">{Math.round(opacity * 100)}%</span>
              <input aria-label="Brush opacity" type="range" min="10" max="100" value={opacity * 100} onChange={(event) => setOpacity(Number(event.target.value) / 100)} />
              <span className="control-label">Opacity</span>
            </aside>
          </div>
        </div>
        <div className="status-pill" role="status">{message}</div>
        <button className="zoom-reset" type="button" onClick={resetView} aria-label="Fit canvas to screen">{Math.round(zoom * 100)}%</button>
      </section>

      {focusMode && <button className="focus-exit" type="button" onClick={() => void toggleFocusMode()} aria-label="Exit focus mode">✕</button>}

      <nav className="tool-dock" aria-label="Drawing tools">
        <IconButton icon="✎" label="Brush" active={tool === 'brush'} onClick={() => chooseTool('brush')} />
        <IconButton icon="⌁" label="Eraser" active={tool === 'eraser'} onClick={() => chooseTool('eraser')} />
        <IconButton icon="◇" label="Fill" active={tool === 'fill'} onClick={() => { chooseTool('fill'); notify('Tap an area, or drag a color onto it'); }} />
        <IconButton icon="↖" label="Move objects" active={tool === 'move'} onClick={() => chooseTool('move')} />
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
        <button type="button" onClick={() => fileRef.current?.click()}>⬆️ <span>Upload picture</span></button>
        <button type="button" onClick={save}>⬇️ <span>Save PNG</span></button>
        <button type="button" onClick={clearArt}>✨ <span>New canvas</span></button>
        <button type="button" onClick={() => void toggleFocusMode()}>⛶ <span>{focusMode ? 'Exit focus mode' : 'Focus mode'}</span></button>
        <button type="button" onClick={() => { setLeftHanded((value) => !value); haptic(8); }}>↔️ <span>{leftHanded ? 'Right-handed layout' : 'Left-handed layout'}</span></button>
        <label>Fill tolerance <b>{tolerance}</b><input type="range" min="5" max="80" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
        <div className="input-hints"><span>👆 1 finger draws</span><span>✌️ 2 fingers zoom • tap undo</span><span>🖱 Ctrl-wheel zoom • Space-drag pan</span></div>
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
