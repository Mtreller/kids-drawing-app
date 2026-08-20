import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ART_HEIGHT, ART_WIDTH, ArtObject, Point, Snapshot, Tool,
  drawObject, fillRegion, hitObject, hitResizeHandle, hitRotateHandle, newObject,
} from './drawing';
import { getCloudStatus, subscribeCloudStatus, type CloudStatus } from './cloud';
import { getHouseShareUrl } from './house';
import {
  adoptHouseCode, currentHouseCode, deleteDrawing, deleteProfile, flushCloudSaves, getDrawing,
  getStorageKind, listDrawingSummaries, listProfiles, makeId, makeThumbnail, migrateLegacyArtwork,
  saveDrawing, saveProfile, setActiveProfileId, syncFromCloud, type DrawingSummary, type Profile,
  type SavedDrawing, type StorageKind,
} from './storage';
import { brushPresets, drawBrushStroke, type BrushType } from './brushes';
import { copyCanvas, createRegionMaskCache, getRegionMask, restoreBaseLine, type RegionMaskCache } from './regionMask';
import { bitmapSource, canvasToJpegBlob, canvasToPngBlob, scaledCanvas, trimHistory } from './history';
import {
  canvasPointFromClient, constrainPan, normalizeRotation,
  type MouseResize, type MouseRotate, type MultiTouch, type ObjectGesture, type ViewGesture,
} from './gestures';
import { DrawingLibrary } from './components/DrawingLibrary';
import { StartChooser } from './components/StartChooser';
import { ProfilePicker } from './components/ProfilePicker';
import { colors, Palette } from './components/Palette';
import { ToolDock, TopBar, type PanelName } from './components/Toolbars';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { FloatingPanels } from './components/FloatingPanels';
import { useColorDropGesture, type DragColor } from './hooks/useColorDropGesture';

type PageBase = { bitmap: string | Blob; width: number; height: number };
type BrushCursor = { x: number; y: number } | null;
type SafariFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type SafariFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

const activeFullscreenElement = () => {
  const safariDocument = document as SafariFullscreenDocument;
  return document.fullscreenElement ?? safariDocument.webkitFullscreenElement ?? null;
};

const BRUSH_MIN = 3;
const BRUSH_MAX = 560;
const BRUSH_DEFAULT = 56;
const BRUSH_STEP = 8;

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
  const gesture = useRef<ObjectGesture | null>(null);
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
  const historyWorkRef = useRef<Promise<void>>(Promise.resolve());
  const pageBaseRef = useRef<PageBase | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionMaskCacheRef = useRef<RegionMaskCache | null>(null);
  const activeRegionMaskRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fillPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fillPreviewTargetRef = useRef<HTMLCanvasElement | string | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const drawingIdRef = useRef<string | null>(null);
  const drawingTitleRef = useRef('Drawing');
  const drawingCreatedAtRef = useRef(Date.now());
  const pendingSaveRef = useRef<{
    snapshot: Snapshot;
    profile: Profile;
    drawingId: string;
    title: string;
    createdAt: number;
  } | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(colors[9]);
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
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
  const [panel, setPanel] = useState<PanelName>(null);
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
  const [drawingActive, setDrawingActive] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [savedArtwork, setSavedArtwork] = useState<Snapshot | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [profileGateOpen, setProfileGateOpen] = useState(true);
  const [bootReady, setBootReady] = useState(false);
  const [houseCode, setHouseCode] = useState('');
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(() => getCloudStatus());
  const [storageKind, setStorageKind] = useState<StorageKind>('device');
  const [libraryTab, setLibraryTab] = useState<'pages' | 'saved'>('pages');
  const [leftHanded, setLeftHanded] = useState(() => {
    try { return window.localStorage.getItem('color-pop-left-handed') === 'true'; }
    catch { return false; }
  });

  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { profileRef.current = activeProfile; }, [activeProfile]);
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
    const fullscreenChanged = () => { if (!activeFullscreenElement()) setFocusMode(false); };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.addEventListener('webkitfullscreenchange', fullscreenChanged);
    return () => {
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      document.removeEventListener('webkitfullscreenchange', fullscreenChanged);
    };
  }, []);
  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    document.body.classList.remove('ios-focus-fallback');
  }, []);

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
    return canvasPointFromClient(canvas, clientX, clientY, canvasRotation, zoom, requireInside);
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
    const source = bitmapSource(base.bitmap);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, base.width, base.height);
      baseCanvasRef.current = canvas;
      source.release();
    };
    image.onerror = source.release;
    image.src = source.url;
  }, []);

  const snapshot = useCallback(async (): Promise<Snapshot> => {
    const backing = backingRef.current;
    if (!backing) throw new Error('Drawing canvas is not ready.');
    const objects = objectsRef.current.map((object) => ({ ...object }));
    const width = backing.width;
    const height = backing.height;
    const base = pageBaseRef.current;
    const bitmap = await canvasToPngBlob(backing);
    return {
      bitmap,
      objects,
      width,
      height,
      baseBitmap: base?.bitmap,
      baseWidth: base?.width,
      baseHeight: base?.height,
    };
  }, []);

  const compositeArt = useCallback(() => {
    const backing = backingRef.current;
    if (!backing) return null;
    const output = document.createElement('canvas');
    output.width = backing.width;
    output.height = backing.height;
    const context = output.getContext('2d');
    if (!context) return null;
    context.drawImage(backing, 0, 0);
    objectsRef.current.forEach((object) => drawObject(context, object));
    return output;
  }, []);

  const persistDrawing = useCallback(async (current: Snapshot, identity?: {
    profile: Profile;
    drawingId: string;
    title: string;
    createdAt: number;
  }) => {
    const profile = identity?.profile ?? profileRef.current;
    const drawingId = identity?.drawingId ?? drawingIdRef.current;
    if (!profile || !drawingId) throw new Error('Pick an artist before saving.');
    const art = compositeArt();
    const thumbnail = art
      ? await canvasToJpegBlob(scaledCanvas(art, 360)).catch(() => canvasToPngBlob(scaledCanvas(art, 360)))
      : await makeThumbnail(current);
    const record: SavedDrawing = {
      id: drawingId,
      profileId: profile.id,
      title: identity?.title ?? drawingTitleRef.current,
      snapshot: current,
      thumbnail,
      createdAt: identity?.createdAt ?? drawingCreatedAtRef.current,
      updatedAt: Date.now(),
    };
    await saveDrawing(record);
    const summary: DrawingSummary = {
      id: record.id,
      profileId: record.profileId,
      title: record.title,
      thumbnail: record.thumbnail,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    setDrawings((list) => [summary, ...list.filter((drawing) => drawing.id !== record.id)]);
    setSavedArtwork(current);
  }, [compositeArt]);

  const scheduleAutosave = useCallback((current: Snapshot) => {
    const profile = profileRef.current;
    const drawingId = drawingIdRef.current;
    if (!profile || !drawingId) return;
    pendingSaveRef.current = {
      snapshot: current,
      profile,
      drawingId,
      title: drawingTitleRef.current,
      createdAt: drawingCreatedAtRef.current,
    };
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (!pending) return;
      void persistDrawing(pending.snapshot, pending).catch(() => undefined);
    }, 400);
  }, [persistDrawing]);

  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      await persistDrawing(pending.snapshot, pending);
      return;
    }
    if (!profileRef.current || !drawingIdRef.current) return;
    await persistDrawing(await snapshot());
  }, [persistDrawing, snapshot]);

  const commitCanvas = useCallback((persist: 'now' | 'soon' = 'soon') => {
    const pendingSnapshot = snapshot();
    const identity = profileRef.current && drawingIdRef.current ? {
      profile: profileRef.current,
      drawingId: drawingIdRef.current,
      title: drawingTitleRef.current,
      createdAt: drawingCreatedAtRef.current,
    } : null;
    historyWorkRef.current = historyWorkRef.current.then(async () => {
      const current = await pendingSnapshot;
      history.current.push(current);
      trimHistory(history.current);
      future.current = [];
      refreshHistoryState();
      if (!identity) return;
      if (persist === 'now') {
        pendingSaveRef.current = null;
        await persistDrawing(current, identity);
      } else scheduleAutosave(current);
    }).catch(() => undefined);
    return historyWorkRef.current;
  }, [persistDrawing, scheduleAutosave, snapshot]);

  const pushHistory = useCallback(() => commitCanvas('soon'), [commitCanvas]);

  const applySnapshot = useCallback((next: Snapshot) => {
    const backing = backingRef.current;
    if (!backing) return;
    const image = new Image();
    const source = bitmapSource(next.bitmap);
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
      source.release();
    };
    image.onerror = source.release;
    image.src = source.url;
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
    capturePageBase(backing);
    setRevision(1);
    let cancelled = false;
    void (async () => {
      const blankBitmap = await canvasToPngBlob(backing);
      if (cancelled) return;
      const base = pageBaseRef.current;
      history.current = [{
        bitmap: blankBitmap,
        objects: [],
        width: ART_WIDTH,
        height: ART_HEIGHT,
        baseBitmap: base?.bitmap,
        baseWidth: ART_WIDTH,
        baseHeight: ART_HEIGHT,
      }];
      refreshHistoryState();
      await migrateLegacyArtwork();
      await syncFromCloud();
      const loadedProfiles = await listProfiles();
      if (cancelled) return;
      setHouseCode(currentHouseCode());
      setCloudStatus(getCloudStatus());
      setStorageKind(getStorageKind());
      setProfiles(loadedProfiles);
      setBootReady(true);
      setProfileGateOpen(true);
      setChooserOpen(false);
    })().catch(() => {
      if (cancelled) return;
      setHouseCode(currentHouseCode());
      setCloudStatus(getCloudStatus());
      setStorageKind(getStorageKind());
      setBootReady(true);
    });
    return () => { cancelled = true; };
  }, [applySnapshot, capturePageBase]);

  useEffect(() => subscribeCloudStatus(setCloudStatus), []);

  useEffect(() => {
    const flush = () => {
      void flushAutosave()
        .catch(() => undefined)
        .then(() => flushCloudSaves())
        .catch(() => undefined);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flushAutosave]);

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
    setPanel(null);
    setDrawingActive(false);
    haptic(entering ? [8, 35, 8] : 6);
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = navigatorWithStandalone.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    const fullscreenTarget = document.documentElement as SafariFullscreenElement;
    const safariDocument = document as SafariFullscreenDocument;
    try {
      if (entering && !activeFullscreenElement()) {
        if (fullscreenTarget.requestFullscreen) await fullscreenTarget.requestFullscreen({ navigationUI: 'hide' });
        else if (fullscreenTarget.webkitRequestFullscreen) await fullscreenTarget.webkitRequestFullscreen();
      } else if (!entering && activeFullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (safariDocument.webkitExitFullscreen) await safariDocument.webkitExitFullscreen();
      }
    } catch {
      try {
        if (entering && !activeFullscreenElement()) {
          if (fullscreenTarget.requestFullscreen) await fullscreenTarget.requestFullscreen();
          else if (fullscreenTarget.webkitRequestFullscreen) await fullscreenTarget.webkitRequestFullscreen();
        }
      } catch { /* Older iPhone Safari requires the Home Screen app for webpage fullscreen. */ }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const fullscreenActive = Boolean(activeFullscreenElement());
    if (!entering) {
      document.body.classList.remove('ios-focus-fallback');
      window.scrollTo(0, 0);
    } else if (fullscreenActive || isStandalone) {
      notify('Full screen on');
    } else if (isIos) {
      document.body.classList.add('ios-focus-fallback');
      window.setTimeout(() => window.scrollTo({ top: 1, behavior: 'smooth' }), 60);
      notify('Focus mode on • Swipe up once if Safari bars remain visible');
    } else {
      notify('Focus mode on');
    }
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
      window.setTimeout(() => void commitCanvas('now'));
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
      context.globalAlpha = .38;
      drawObject(context, { ...object, color: previewColor });
    } else if (mask) {
      context.globalAlpha = .34;
      context.fillStyle = previewColor;
      context.fillRect(0, 0, preview.width, preview.height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask, 0, 0);
    }
    context.restore();
    fillPreviewTargetRef.current = target;
    setFillPreviewActive(true);
    haptic(6);
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

  const undo = async () => {
    await historyWorkRef.current;
    if (history.current.length <= 1) return;
    future.current.push(history.current.pop()!);
    const previous = history.current.at(-1)!;
    applySnapshot(previous);
    void persistDrawing(previous).catch(() => undefined);
    refreshHistoryState();
    haptic(8);
  };
  const redo = async () => {
    await historyWorkRef.current;
    const next = future.current.pop();
    if (!next) return;
    history.current.push(next);
    applySnapshot(next);
    void persistDrawing(next).catch(() => undefined);
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
    window.setTimeout(() => void commitCanvas('now'));
    notify('Fresh canvas ready');
  };

  const resetPage = () => {
    const backing = backingRef.current;
    const base = pageBaseRef.current;
    if (!backing || !base) return;
    const image = new Image();
    const source = bitmapSource(base.bitmap);
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
      window.setTimeout(() => void commitCanvas('now'));
      haptic([8, 35, 8]);
      notify('Page reset • Undo brings your work back');
      source.release();
    };
    image.onerror = source.release;
    image.src = source.url;
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
      window.setTimeout(() => void commitCanvas('now'));
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

  const beginSession = () => {
    setChooserOpen(false);
    setProfileGateOpen(false);
    setSessionStarted(true);
    setPanel(null);
    setDrawingActive(false);
  };

  const startNewDrawing = async (title: string) => {
    await flushAutosave().catch(() => undefined);
    drawingIdRef.current = makeId();
    drawingTitleRef.current = title;
    drawingCreatedAtRef.current = Date.now();
  };

  const refreshProfileDrawings = async (profileId: string) => {
    const summaries = await listDrawingSummaries(profileId);
    setDrawings(summaries);
    return summaries;
  };

  const chooseProfile = async (profile: Profile) => {
    if (activeProfile?.id === profile.id && sessionStarted && !chooserOpen) {
      setProfileGateOpen(false);
      return;
    }
    await historyWorkRef.current;
    await setActiveProfileId(profile.id);
    profileRef.current = profile;
    setActiveProfile(profile);
    const summaries = await refreshProfileDrawings(profile.id);
    const newest = summaries[0];
    if (newest) {
      const full = await getDrawing(newest.id);
      drawingIdRef.current = newest.id;
      drawingTitleRef.current = newest.title;
      drawingCreatedAtRef.current = newest.createdAt;
      setSavedArtwork(full?.snapshot ?? null);
    } else {
      drawingIdRef.current = null;
      drawingTitleRef.current = 'Drawing';
      setSavedArtwork(null);
    }
    setSessionStarted(false);
    setProfileGateOpen(false);
    setChooserOpen(true);
    setPanel(null);
    setDrawingActive(false);
  };

  const createProfile = async (input: { name: string; color: string; emoji: string }) => {
    const now = Date.now();
    const profile: Profile = {
      id: makeId(),
      name: input.name,
      color: input.color,
      emoji: input.emoji,
      createdAt: now,
      updatedAt: now,
    };
    await saveProfile(profile);
    setProfiles((list) => [...list, profile]);
    await chooseProfile(profile);
  };

  const removeProfile = async (profile: Profile) => {
    await deleteProfile(profile.id);
    setProfiles((list) => list.filter((item) => item.id !== profile.id));
    if (activeProfile?.id !== profile.id) return;
    profileRef.current = null;
    drawingIdRef.current = null;
    setActiveProfile(null);
    setDrawings([]);
    setSavedArtwork(null);
    setSessionStarted(false);
    setChooserOpen(false);
    setProfileGateOpen(true);
  };

  const joinHouse = async (code: string) => {
    await adoptHouseCode(code);
    const loadedProfiles = await listProfiles();
    profileRef.current = null;
    drawingIdRef.current = null;
    setHouseCode(currentHouseCode());
    setCloudStatus(getCloudStatus());
    setStorageKind(getStorageKind());
    setProfiles(loadedProfiles);
    setActiveProfile(null);
    setDrawings([]);
    setSavedArtwork(null);
    setSessionStarted(false);
    setChooserOpen(false);
    setProfileGateOpen(true);
  };

  const chooseBlankCanvas = () => {
    void (async () => {
      await startNewDrawing('Blank drawing');
      if (sessionStarted) {
        const backing = backingRef.current;
        const context = backing?.getContext('2d');
        if (context && backing) {
          context.globalCompositeOperation = 'source-over';
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, backing.width, backing.height);
          capturePageBase(backing);
          objectsRef.current = [];
          setObjects([]);
          setSelectedId(null);
          setRevision((value) => value + 1);
        }
      }
      await commitCanvas('now');
      notify(sessionStarted ? 'Fresh canvas ready' : 'Blank canvas ready');
      beginSession();
    })();
  };

  const chooseContinue = () => {
    if (!sessionStarted && savedArtwork) {
      history.current = [savedArtwork];
      future.current = [];
      applySnapshot(savedArtwork);
      refreshHistoryState();
      notify('Welcome back!');
    } else if (!drawingIdRef.current) {
      void startNewDrawing(drawingTitleRef.current || 'Drawing').then(() => commitCanvas('now'));
    }
    beginSession();
  };

  const openNewCanvasChooser = () => {
    setPanel(null);
    setChooserOpen(true);
    setDrawingActive(false);
  };

  const selectLibraryPage = (src: string, title: string) => {
    void startNewDrawing(title).then(() => {
      loadLibraryPage(src, title);
      beginSession();
    });
  };

  const openSavedDrawing = async (id: string) => {
    const record = await getDrawing(id);
    if (!record) {
      notify('That drawing could not be opened');
      return;
    }
    drawingIdRef.current = record.id;
    drawingTitleRef.current = record.title;
    drawingCreatedAtRef.current = record.createdAt;
    history.current = [record.snapshot];
    future.current = [];
    applySnapshot(record.snapshot);
    refreshHistoryState();
    setSavedArtwork(record.snapshot);
    notify(`${record.title} is ready`);
    beginSession();
  };

  const removeDrawing = async (id: string) => {
    await deleteDrawing(id);
    setDrawings((list) => list.filter((drawing) => drawing.id !== id));
    if (drawingIdRef.current === id) {
      drawingIdRef.current = null;
      setSavedArtwork(null);
    }
    notify('Drawing deleted');
  };

  const saveToGallery = async () => {
    try {
      if (!profileRef.current) {
        setProfileGateOpen(true);
        return;
      }
      if (!drawingIdRef.current) await startNewDrawing('Drawing');
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
      await historyWorkRef.current;
      await persistDrawing(await snapshot());
      notify(`Saved to ${profileRef.current.name}’s drawings`);
    } catch {
      notify('Could not save that drawing. Try again.');
    } finally {
      setPanel(null);
    }
  };

  const downloadPng = () => {
    const output = compositeArt();
    if (!output) return;
    const link = document.createElement('a');
    link.download = `color-pop-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
    notify('Artwork downloaded as PNG');
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
      if (chooserOpen || profileGateOpen) {
        if (event.key === 'Escape') {
          setPanel(null);
          if (profileGateOpen && activeProfile) setProfileGateOpen(false);
        }
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (modifier && key === 's') {
        event.preventDefault();
        saveToGallery();
      } else if (key === 'b') chooseTool('brush');
      else if (key === 'e') chooseTool('eraser');
      else if (key === 'f') chooseTool('fill');
      else if (key === 'v') chooseTool('move');
      else if (key === '[') setBrushSize((value) => Math.max(BRUSH_MIN, value - BRUSH_STEP));
      else if (key === ']') setBrushSize((value) => Math.min(BRUSH_MAX, value + BRUSH_STEP));
      else if (key === '0') resetView();
      else if (key === 'r') resetPage();
      else if (key === 'm') toggleStayInLines();
      else if (key === 'h') void toggleFocusMode();
      else if (key === 'l') setLeftHanded((value) => !value);
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); deleteSelected(); }
      else if (event.key === 'Escape') {
        setPanel(null);
        if (!chooserOpen && focusMode) void toggleFocusMode();
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

  const startColorDrag = useColorDropGesture({
    canvasRef: visibleRef,
    pointFromClient,
    previewColorDrop,
    clearFillPreview,
    fillAt,
    setColor,
    onSelectBrush: selectBrush,
    activateFillTool: () => setTool('fill'),
    closePanels: () => setPanel(null),
    stopDrawing: () => setDrawingActive(false),
    setDragColor,
    setMessage,
    clearBrushCursor: () => setBrushCursor(null),
    haptic,
    notify,
  });

  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;

  return (
    <main className={`app-shell${focusMode ? ' is-focus' : ''}${drawingActive ? ' is-drawing' : ''}${leftHanded ? ' is-left-handed' : ''}${stayInLines ? ' is-line-safe' : ''}${chooserOpen || profileGateOpen ? ' is-choosing' : ''}${dragColor ? ' is-color-dropping' : ''}`}>
      <TopBar
        focusMode={focusMode}
        canUndo={historyState.undo}
        canRedo={historyState.redo}
        profileName={activeProfile?.name ?? 'Artist'}
        profileEmoji={activeProfile?.emoji ?? '🎨'}
        profileColor={activeProfile?.color ?? '#eee8ff'}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        onFocus={() => void toggleFocusMode()}
        onLibrary={() => { setLibraryTab('pages'); setPanel('library'); }}
        onActions={() => setPanel(panel === 'actions' ? null : 'actions')}
        onProfile={() => { setPanel(null); setProfileGateOpen(true); }}
      />

      <CanvasWorkspace
        message={message}
        stayInLines={stayInLines}
        selectedObject={selectedObject}
        canvasRotation={canvasRotation}
        zoom={zoom}
        onRotateSelected={rotateSelected}
        onDeleteSelected={deleteSelected}
        onRotateCanvas={rotateCanvas}
        onResetCanvasRotation={resetCanvasRotation}
        onResetView={resetView}
        onWheel={wheelCanvas}
        onStagePointerDown={stagePointerDown}
        onStagePointerMove={stagePointerMove}
        onStagePointerUp={stagePointerUp}
        onStagePointerCancel={stagePointerUp}
        clusterRef={clusterRef}
        sizeControlRef={sizeControlRef}
        opacityControlRef={opacityControlRef}
        brushSize={brushSize}
        brushMinimum={BRUSH_MIN}
        brushMaximum={BRUSH_MAX}
        opacity={opacity}
        onBrushSize={setBrushSize}
        onOpacity={setOpacity}
        onOpenBrush={() => setPanel(panel === 'brush' ? null : 'brush')}
        drawingActive={drawingActive}
        canvasSize={canvasSize}
        displaySize={displaySize}
        pan={pan}
        visibleRef={visibleRef}
        fillPreviewRef={fillPreviewCanvasRef}
        fillPreviewActive={fillPreviewActive}
        tool={tool}
        brushCursor={brushCursor}
        onCanvasPointerDown={pointerDown}
        onCanvasPointerMove={pointerMove}
        onCanvasPointerUp={pointerUp}
        onCanvasPointerCancel={pointerUp}
        onCanvasPointerEnter={(event) => { if (tool === 'brush' || tool === 'eraser') setBrushCursor(pointFromClient(event.currentTarget, event.clientX, event.clientY)); }}
        onCanvasPointerLeave={() => { if (!pointers.current.size) setBrushCursor(null); }}
      />

      <ToolDock
        tool={tool}
        panel={panel}
        stayInLines={stayInLines}
        onBrush={() => { chooseTool('brush'); setPanel(panel === 'brush' ? null : 'brush'); }}
        onStayInLines={toggleStayInLines}
        onEraser={() => chooseTool('eraser')}
        onFill={() => { chooseTool('fill'); notify('Tap an area, or drag a color onto it'); }}
        onMove={() => chooseTool('move')}
        onShapes={() => setPanel(panel === 'shapes' ? null : 'shapes')}
        onStickers={() => setPanel(panel === 'stickers' ? null : 'stickers')}
        onReset={resetPage}
      />

      <FloatingPanels
        panel={panel}
        brushType={brushType}
        color={color}
        brushSize={brushSize}
        brushMinimum={BRUSH_MIN}
        brushMaximum={BRUSH_MAX}
        opacity={opacity}
        flow={flow}
        smoothing={smoothing}
        stayInLines={stayInLines}
        tolerance={tolerance}
        focusMode={focusMode}
        leftHanded={leftHanded}
        onClose={() => setPanel(null)}
        onSelectBrush={selectBrush}
        onToggleStayInLines={toggleStayInLines}
        onBrushSize={setBrushSize}
        onOpacity={setOpacity}
        onFlow={setFlow}
        onSmoothing={setSmoothing}
        onAddShape={(shape) => addObject(shape)}
        onAddSticker={(sticker) => addObject('sticker', sticker)}
        onUpload={() => fileRef.current?.click()}
        onSave={() => void saveToGallery()}
        onDownload={downloadPng}
        onResetPage={resetPage}
        onClearArt={openNewCanvasChooser}
        onToggleFocus={() => void toggleFocusMode()}
        onToggleHanded={() => { setLeftHanded((value) => !value); haptic(8); }}
        onTolerance={setTolerance}
      />
      {profileGateOpen && !bootReady && <div className="start-chooser profile-gate" role="status" aria-live="polite">
        <div className="start-chooser__panel">
          <header className="start-chooser__header">
            <span className="brand__mark" aria-hidden="true">✦</span>
            <div>
              <span className="eyebrow">Color Pop</span>
              <h1>Finding your artists…</h1>
            </div>
          </header>
          <p className="profile-house__status">Checking this device and the family cloud.</p>
        </div>
      </div>}
      {profileGateOpen && bootReady && <ProfilePicker
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        houseCode={houseCode}
        houseShareUrl={getHouseShareUrl(houseCode)}
        cloudStatus={cloudStatus}
        storageKind={storageKind}
        onSelect={(profile) => void chooseProfile(profile)}
        onCreate={(input) => void createProfile(input)}
        onDelete={(profile) => void removeProfile(profile)}
        onJoinHouse={(code) => joinHouse(code)}
      />}
      {chooserOpen && !profileGateOpen && panel !== 'library' && <StartChooser
        profile={activeProfile}
        savedBitmap={savedArtwork?.bitmap ?? null}
        savedCount={drawings.length}
        showContinue={sessionStarted || Boolean(savedArtwork?.bitmap)}
        sessionStarted={sessionStarted}
        onColorDrawing={() => { setLibraryTab('pages'); setPanel('library'); }}
        onBlankCanvas={chooseBlankCanvas}
        onMyDrawings={() => { setLibraryTab('saved'); setPanel('library'); }}
        onContinue={chooseContinue}
        onSwitchProfile={() => setProfileGateOpen(true)}
      />}
      {panel === 'library' && <DrawingLibrary
        key={libraryTab}
        initialTab={libraryTab}
        savedDrawings={drawings}
        artistName={activeProfile?.name ?? 'My'}
        onClose={() => setPanel(null)}
        onSelect={selectLibraryPage}
        onSelectSaved={(id) => void openSavedDrawing(id)}
        onDeleteSaved={(id) => void removeDrawing(id)}
      />}

      <Palette tool={tool} brushType={brushType} color={color} onBrush={selectBrush} onPalettePointerDown={startColorDrag} onCustomColor={setColor} />
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ''; }} />
      {dragColor && <div className={`color-drop-orb${fillPreviewActive ? ' is-over-target' : ''}`} style={{ left: dragColor.x, top: dragColor.y, backgroundColor: dragColor.color }} />}
    </main>
  );
}
