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
import { brushPresets, drawBrushStroke, isMagicBrush, type BrushType } from './brushes';
import { copyCanvas, createRegionMaskCache, getRegionMask, restoreBaseLine, type RegionMaskCache } from './regionMask';
import { bitmapSource, canvasToJpegBlob, canvasToPngBlob, scaledCanvas, trimHistory } from './history';
import {
  canvasMetrics, canvasPointFromClient, canvasPointFromRect, clampZoom, constrainPan, normalizeRotation, solveViewGesture, zoomAroundPoint,
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
import { Celebration, SparkleLayer, type Burst } from './components/Celebrations';
import { playSound, setSoundEnabled, soundEnabled } from './sounds';
import { TOUCH_TAP_MOVE_PX, createTouchTapTracker, isTouchLikePointer, isUiTouchTarget } from './touchTap';

type PageBase = { bitmap: string | Blob; width: number; height: number };
type PencilPreference = 'auto' | 'on' | 'off';
type PointerSample = { clientX: number; clientY: number; pressure: number };
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
/** Brushes painted on a temporary layer so overlapping segments never bead at low opacity. */
const LAYERED_BRUSHES = new Set<BrushType>(['round', 'marker', 'pencil']);
/** Touches this soon after the Pencil lifts are treated as a resting palm. */
const PALM_GRACE_MS = 450;
const DEFAULT_MESSAGE = 'Choose a tool and start creating!';

/**
 * Little kids can't read the status line, so kid mode shows only a few short,
 * emoji-led toasts. Everything else is told through sound and sparkles.
 */
const KID_TOASTS: Array<[RegExp, string]> = [
  [/^Try another enclosed area/, '👆 Tap inside a shape'],
  [/^Start the brush inside a section/, '👆 Start inside a shape'],
  [/^Undo$/, '↩️'],
  [/^Redo$/, '↪️'],
  [/^Welcome back/, '👋 Welcome back!'],
  [/^Page reset/, '🧽 Fresh page'],
  [/^✏️ Pencil ready/, '✏️ Pencil ready!'],
  [/^Draw with the Pencil/, '✏️ Draw with the Pencil'],
  [/^Could not save/, '😕 Try again'],
  [/^That coloring page could not be loaded/, '😕 Try another picture'],
  [/^Grown-ups/, '🔒 Grown-ups: press and hold'],
  [/^Stay Inside Lines on/, '✨ Magic lines on'],
  [/^Free drawing mode on/, '🖍️ Free drawing'],
];
const kidToastFor = (text: string) => KID_TOASTS.find(([pattern]) => pattern.test(text))?.[1] ?? null;

const readKidMode = () => {
  try { return window.localStorage.getItem('color-pop-kid-mode') !== 'off'; }
  catch { return true; }
};

const readPencilPreference = (): PencilPreference => {
  try {
    const stored = window.localStorage.getItem('color-pop-pencil-only');
    return stored === 'on' || stored === 'off' ? stored : 'auto';
  } catch { return 'auto'; }
};

/** Blank pages follow the way the tablet is held. */
const blankPageSize = () => {
  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth * 1.08;
  return portrait ? { width: ART_HEIGHT, height: ART_WIDTH } : { width: ART_WIDTH, height: ART_HEIGHT };
};

export function App() {
  const visibleRef = useRef<HTMLCanvasElement>(null);
  const backingRef = useRef<HTMLCanvasElement | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const [canvasStage, setCanvasStage] = useState<HTMLDivElement | null>(null);
  const bindCanvasStage = useCallback((node: HTMLDivElement | null) => {
    canvasStageRef.current = node;
    setCanvasStage((current) => current === node ? current : node);
  }, []);
  const sizeControlRef = useRef<HTMLElement>(null);
  const opacityControlRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const screenPointers = useRef(new Map<number, Point & { startX: number; startY: number }>());
  const undoActionRef = useRef<() => void>(() => {});
  const redoActionRef = useRef<() => void>(() => {});
  const notifyRef = useRef<(text: string) => void>(() => {});
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
  const selectedIdRef = useRef<string | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const strokeLayerRef = useRef<HTMLCanvasElement | null>(null);
  const strokeLayerAlphaRef = useRef(1);
  const strokeLayerActiveRef = useRef(false);
  const brushCursorRef = useRef<HTMLSpanElement>(null);
  const penDownRef = useRef(false);
  const lastPenAtRef = useRef(0);
  const activeStrokeToolRef = useRef<Tool | null>(null);
  const lastPressureRef = useRef(1);
  const notifyTimerRef = useRef<number | null>(null);
  const displaySizeRef = useRef<{ width: number; height: number } | null>(null);
  const pencilHintShownRef = useRef(false);
  const finishAfterCelebrationRef = useRef(false);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(colors[9]);
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  const [opacity, setOpacity] = useState(1);
  const [flow, setFlow] = useState(.8);
  const [smoothing, setSmoothing] = useState(.35);
  const [brushType, setBrushType] = useState<BrushType>('round');
  const brushTypeRef = useRef<BrushType>('round');
  const lastSolidBrushRef = useRef<BrushType>('round');
  const [stayInLines, setStayInLines] = useState(true);
  const [tolerance, setTolerance] = useState(32);
  const [objects, setObjects] = useState<ArtObject[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: ART_WIDTH, height: ART_HEIGHT });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelName>(null);
  const [dragColor, setDragColor] = useState<DragColor>(null);
  const [fillPreviewActive, setFillPreviewActive] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [pencilPreference, setPencilPreference] = useState<PencilPreference>(readPencilPreference);
  const [penSeen, setPenSeen] = useState(false);
  const [kidMode, setKidMode] = useState(readKidMode);
  const kidModeRef = useRef(kidMode);
  kidModeRef.current = kidMode;
  const [soundOn, setSoundOn] = useState(soundEnabled);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [celebration, setCelebration] = useState<{ emoji: string; label: string } | null>(null);
  const burstIdRef = useRef(0);
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
  useEffect(() => { brushTypeRef.current = brushType; }, [brushType]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    try { window.localStorage.setItem('color-pop-kid-mode', kidMode ? 'on' : 'off'); }
    catch { /* Applies for this session. */ }
  }, [kidMode]);
  useEffect(() => { displaySizeRef.current = displaySize; }, [displaySize]);
  useEffect(() => {
    try {
      if (pencilPreference === 'auto') window.localStorage.removeItem('color-pop-pencil-only');
      else window.localStorage.setItem('color-pop-pencil-only', pencilPreference);
    } catch { /* The preference still applies for this session. */ }
  }, [pencilPreference]);
  /** With a Pencil in use, fingers only zoom, pan and tap-undo; they never paint. */
  const pencilOnly = pencilPreference === 'on' || (pencilPreference === 'auto' && penSeen);
  const pencilOnlyRef = useRef(pencilOnly);
  pencilOnlyRef.current = pencilOnly;
  const palmGuardActive = () => penDownRef.current || performance.now() - lastPenAtRef.current < PALM_GRACE_MS;
  useEffect(() => {
    try { window.localStorage.setItem('color-pop-left-handed', String(leftHanded)); }
    catch { /* Settings still work for this session when storage is unavailable. */ }
  }, [leftHanded]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('color-pop-brush') ?? '{}') as { flow?: number; smoothing?: number; stayInLines?: boolean; brushType?: BrushType };
      if (typeof saved.flow === 'number') setFlow(saved.flow);
      if (typeof saved.smoothing === 'number') setSmoothing(saved.smoothing);
      if (saved.brushType && brushPresets.some((brush) => brush.id === saved.brushType)) {
        setBrushType(saved.brushType);
        if (!isMagicBrush(saved.brushType)) lastSolidBrushRef.current = saved.brushType;
      }
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

  const renderNow = useCallback(() => {
    if (renderFrameRef.current !== null) {
      cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
    const canvas = visibleRef.current;
    const backing = backingRef.current;
    if (!canvas || !backing) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(backing, 0, 0);
    const layer = strokeLayerRef.current;
    if (strokeLayerActiveRef.current && layer) {
      context.save();
      context.globalAlpha = strokeLayerAlphaRef.current;
      context.drawImage(layer, 0, 0);
      context.restore();
    }
    objectsRef.current.forEach((object) => drawObject(context, object, object.id === selectedIdRef.current));
  }, []);

  /** Paint at most once per display frame, without asking React to re-render. */
  const requestRender = useCallback(() => {
    if (renderFrameRef.current !== null) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderNow();
    });
  }, [renderNow]);

  useEffect(() => { renderNow(); }, [renderNow, objects, revision, selectedId, canvasSize]);
  useEffect(() => () => { if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current); }, []);

  /** Flatten the in-progress stroke into the page. */
  const commitStrokeLayer = useCallback(() => {
    const layer = strokeLayerRef.current;
    const backing = backingRef.current;
    if (!strokeLayerActiveRef.current || !layer || !backing) return;
    const context = backing.getContext('2d');
    if (context) {
      context.save();
      context.globalAlpha = strokeLayerAlphaRef.current;
      context.drawImage(layer, 0, 0);
      context.restore();
    }
    layer.getContext('2d')?.clearRect(0, 0, layer.width, layer.height);
    strokeLayerActiveRef.current = false;
    requestRender();
  }, [requestRender]);

  const moveBrushCursor = useCallback((point: Point | null) => {
    const element = brushCursorRef.current;
    const backing = backingRef.current;
    if (!element) return;
    if (!point || !backing) {
      element.style.display = 'none';
      return;
    }
    element.style.display = 'block';
    element.style.left = `${point.x / backing.width * 100}%`;
    element.style.top = `${point.y / backing.height * 100}%`;
  }, []);

  /** Where a page point currently sits on screen (for sparkles). */
  const canvasPointToClient = (point: Point) => {
    const canvas = visibleRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = (point.x / canvas.width - .5) * canvas.clientWidth * zoom;
    const localY = (point.y / canvas.height - .5) * canvas.clientHeight * zoom;
    const cosine = Math.cos(canvasRotation);
    const sine = Math.sin(canvasRotation);
    return {
      x: rect.left + rect.width / 2 + localX * cosine - localY * sine,
      y: rect.top + rect.height / 2 + localX * sine + localY * cosine,
    };
  };

  const sparkleAt = (point: Point | null, sparkColor: string, big = false) => {
    const screen = point ? canvasPointToClient(point) : null;
    if (!screen) return;
    const id = ++burstIdRef.current;
    setBursts((list) => [...list.slice(-5), { id, x: screen.x, y: screen.y, color: sparkColor, big }]);
    window.setTimeout(() => setBursts((list) => list.filter((burst) => burst.id !== id)), 900);
  };

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
  }, capturedArt?: HTMLCanvasElement | null) => {
    const profile = identity?.profile ?? profileRef.current;
    const drawingId = identity?.drawingId ?? drawingIdRef.current;
    if (!profile || !drawingId) throw new Error('Pick an artist before saving.');
    const art = capturedArt ?? compositeArt();
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
    // A background save of a drawing we've already left must not replace "keep going".
    if (record.id === drawingIdRef.current) setSavedArtwork(current);
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
    // One timer, so a new message is never cut short by an older one.
    if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setMessage(DEFAULT_MESSAGE), 2400);
  };
  useEffect(() => () => { if (notifyTimerRef.current) window.clearTimeout(notifyTimerRef.current); }, []);
  notifyRef.current = notify;

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
    if (nextTool !== 'brush' && nextTool !== 'eraser') moveBrushCursor(null);
    activeRegionMaskRef.current = null;
    haptic(6);
    playSound('tap');
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
    if (!isMagicBrush(nextBrush)) lastSolidBrushRef.current = nextBrush;
    setBrushType(nextBrush);
    setTool('brush');
    setDrawingActive(false);
    activeRegionMaskRef.current = null;
    haptic(7);
    playSound(isMagicBrush(nextBrush) ? 'sparkle' : 'tap');
    if (kidModeRef.current) setPanel(null);
    setMessage(`${preset?.icon ?? '🖌️'} ${preset?.name ?? 'Brush'} selected`);
  };

  const selectColor = (nextColor: string) => {
    if (nextColor !== color) playSound('tap');
    setColor(nextColor);
    if (!isMagicBrush(brushTypeRef.current)) return;
    setBrushType(lastSolidBrushRef.current);
    setMessage('Color selected');
  };

  const drawLine = (from: Point, to: Point, pointerType = 'touch', pressure = 1, strokeTool: Tool = tool) => {
    const backing = backingRef.current;
    const context = backing?.getContext('2d');
    if (!context || !backing) return;
    // Blend pressure between samples so pen strokes swell and taper smoothly.
    const blendedPressure = pointerType === 'pen' ? (lastPressureRef.current + Math.max(.05, pressure)) / 2 : 1;
    if (pointerType === 'pen') lastPressureRef.current = Math.max(.05, pressure);
    const pressureScale = pointerType === 'pen' ? .25 + blendedPressure * .85 : 1;
    const lineWidth = Math.max(1, brushSize * Math.min(1.1, pressureScale));
    const alpha = Math.max(.03, opacity * flow);
    const mask = stayInLines ? activeRegionMaskRef.current : null;
    if (strokeTool === 'brush' && LAYERED_BRUSHES.has(brushType)) {
      let layer = strokeLayerRef.current;
      if (!layer) {
        layer = document.createElement('canvas');
        strokeLayerRef.current = layer;
      }
      if (layer.width !== backing.width || layer.height !== backing.height) {
        layer.width = backing.width;
        layer.height = backing.height;
        strokeLayerActiveRef.current = false;
      }
      const scratch = scratchCanvasRef.current ?? document.createElement('canvas');
      scratchCanvasRef.current = scratch;
      drawBrushStroke({ backing: layer, mask, scratch, from, to, color, size: lineWidth, alpha: 1, type: brushType });
      strokeLayerAlphaRef.current = alpha;
      strokeLayerActiveRef.current = true;
    } else if (strokeTool === 'eraser') {
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
    requestRender();
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

  /** Untransformed centre of the page on screen (its transform pivots around the centre). */
  const canvasOrigin = () => {
    const wrap = visibleRef.current?.parentElement;
    if (!wrap) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = wrap.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - pan.x, y: rect.top + rect.height / 2 - pan.y };
  };

  const wheelCanvas = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : 1;
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = clampZoom(zoom * Math.exp(-event.deltaY * unit * .008));
      const focusPan = zoomAroundPoint(zoom, nextZoom, pan, { x: event.clientX, y: event.clientY }, canvasOrigin());
      setZoom(nextZoom);
      setPan(constrainPan(nextZoom, focusPan, displaySize, canvasRotation));
      setMessage(`Canvas zoom ${Math.round(nextZoom * 100)}%`);
      return;
    }
    if (zoom > 1) {
      setPan(constrainPan(zoom, { x: pan.x - event.deltaX * unit, y: pan.y - event.deltaY * unit }, displaySize, canvasRotation));
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
      playSound('pop');
      sparkleAt(point, fillColor);
      notify('Object colored!');
      return;
    }
    if (backingRef.current && fillRegion(backingRef.current, point, fillColor, tolerance)) {
      setRevision((value) => value + 1);
      window.setTimeout(() => void commitCanvas('now'));
      haptic(10);
      playSound('pop');
      sparkleAt(point, fillColor);
      notify('Area filled!');
    } else {
      playSound('nope');
      notify('Try another enclosed area');
    }
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

  const screenPointerPoints = () => new Map([...screenPointers.current].map(([id, point]) => [id, { x: point.x, y: point.y }]));

  const screenPointersMoved = () => {
    for (const point of screenPointers.current.values()) {
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > TOUCH_TAP_MOVE_PX) return true;
    }
    return false;
  };

  const shouldNavigateCanvas = () => {
    const startedOutsideCanvas = [...viewPointerOnCanvas.current.values()].some((inside) => !inside);
    return tool !== 'move' || !selectedId || startedOutsideCanvas;
  };

  /** Finger strokes in progress when a second finger lands become part of the page. */
  const settleFingerStroke = () => {
    if (penDownRef.current) return;
    commitStrokeLayer();
    lastPoint.current = null;
    fillTap.current = null;
    fillTapMoved.current = true;
    moveBrushCursor(null);
  };

  const beginMultiTouchSession = () => {
    if (screenPointers.current.size < 2) return;
    if (!multiTouch.current) {
      multiTouch.current = {
        startedAt: Date.now(),
        maxPointers: screenPointers.current.size,
        moved: false,
        initial: screenPointerPoints(),
      };
      settleFingerStroke();
    } else {
      multiTouch.current.maxPointers = Math.max(multiTouch.current.maxPointers, screenPointers.current.size);
    }
  };

  const viewGestureFromPointers = (): ViewGesture => {
    const [a, b] = [...screenPointers.current.values()];
    return {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom,
      pan: { ...pan },
      rotation: canvasRotation,
      origin: canvasOrigin(),
      rotationUnlocked: viewGesture.current?.rotationUnlocked ?? false,
    };
  };

  const startCanvasNavigation = () => {
    if (screenPointers.current.size < 2 || navigatingCanvas.current || !shouldNavigateCanvas()) return;
    if (strokeStarted.current && !penDownRef.current) {
      commitStrokeLayer();
      pushHistory();
    }
    activeRegionMaskRef.current = null;
    viewGesture.current = null;
    viewGesture.current = viewGestureFromPointers();
    lastPoint.current = null;
    strokeStarted.current = false;
    fillTap.current = null;
    fillTapMoved.current = true;
    navigatingCanvas.current = true;
    beginMultiTouchSession();
    if (multiTouch.current) multiTouch.current.moved = true;
    moveBrushCursor(null);
    setMessage('Pinch, drag or twist anywhere around the canvas');
  };

  const finishCanvasNavigation = (announce = true) => {
    if (!navigatingCanvas.current && !multiTouch.current) return;
    const didMove = Boolean(multiTouch.current?.moved || navigatingCanvas.current);
    multiTouch.current = null;
    navigatingCanvas.current = false;
    viewGesture.current = null;
    if (!penDownRef.current) {
      pointers.current.clear();
      lastPoint.current = null;
      strokeStarted.current = false;
      activeRegionMaskRef.current = null;
    }
    fillTap.current = null;
    fillTapMoved.current = false;
    if (announce && didMove) notify(`Canvas ${Math.round(zoom * 100)}% • ${Math.round(canvasRotation * 180 / Math.PI)}°`);
    endDrawing();
  };

  const stagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only fingers steer the page. The Pencil always draws, and a palm resting
    // while the Pencil is down must never start a pinch.
    if (event.pointerType !== 'touch') return;
    if (isUiTouchTarget(event.target)) return;
    if (palmGuardActive()) return;
    screenPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    viewPointerOnCanvas.current.set(event.pointerId, Boolean((event.target as Element | null)?.closest('.canvas-wrap')));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue tracking through bubbling when capture is unavailable. */ }
    if (screenPointers.current.size >= 2) beginMultiTouchSession();
  };

  const stagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = screenPointers.current.get(event.pointerId);
    if (!current) return;
    current.x = event.clientX;
    current.y = event.clientY;
    if (screenPointers.current.size < 2) return;
    beginMultiTouchSession();
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
        const initialCenter = { x: (initialA.x + initialB.x) / 2, y: (initialA.y + initialB.y) / 2 };
        if (
          screenPointersMoved()
          || Math.abs(distance - initialDistance) > TOUCH_TAP_MOVE_PX
          || Math.hypot(center.x - initialCenter.x, center.y - initialCenter.y) > TOUCH_TAP_MOVE_PX
        ) multiTouch.current.moved = true;
      }
    }
    if (!navigatingCanvas.current) {
      if (!multiTouch.current?.moved) return;
      startCanvasNavigation();
    }
    const start = viewGesture.current;
    if (!start) return;
    event.preventDefault();
    const next = solveViewGesture(start, { distance, angle, center });
    if (next.rotationUnlocked && !start.rotationUnlocked) {
      // Re-anchor so the turn starts smoothly from here.
      viewGesture.current = { ...start, rotationUnlocked: true, angle, center, distance, zoom: next.zoom, pan: next.pan, rotation: next.rotation, origin: start.origin };
    }
    setZoom(next.zoom);
    setCanvasRotation(next.rotation);
    setPan(constrainPan(next.zoom, next.pan, displaySizeRef.current, next.rotation));
  };

  const stagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!screenPointers.current.has(event.pointerId)) return;
    screenPointers.current.delete(event.pointerId);
    viewPointerOnCanvas.current.delete(event.pointerId);
    if (screenPointers.current.size >= 2 && navigatingCanvas.current) {
      viewGesture.current = viewGestureFromPointers();
      return;
    }
    if (screenPointers.current.size < 2) viewGesture.current = null;
    if (screenPointers.current.size) return;
    finishCanvasNavigation();
  };

  /** Fingers that land while a Pencil is in use should not paint. */
  const touchIsBlocked = (pointerType: string, activeTool: Tool) => {
    if (pointerType !== 'touch') return false;
    if (palmGuardActive()) return true;
    if (!pencilOnlyRef.current) return false;
    return activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'fill';
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const isPen = event.pointerType === 'pen';
    if (event.pointerType === 'mouse' && event.button === 2) return;
    if (isPen) {
      penDownRef.current = true;
      lastPenAtRef.current = performance.now();
      lastPressureRef.current = Math.max(.05, event.pressure || .5);
      if (!penSeen) {
        setPenSeen(true);
        if (pencilPreference === 'auto' && !pencilHintShownRef.current) {
          pencilHintShownRef.current = true;
          notify('✏️ Pencil ready • fingers now zoom and pan (change in Actions)');
        }
      }
      // A palm that landed just before the Pencil should not keep steering the page.
      if (navigatingCanvas.current || multiTouch.current) {
        screenPointers.current.clear();
        viewPointerOnCanvas.current.clear();
        finishCanvasNavigation(false);
      }
    } else if (navigatingCanvas.current || (multiTouch.current && tool !== 'move')) return;

    // The Pencil's eraser end (or barrel eraser button) erases for this stroke only.
    const penEraser = isPen && (event.buttons & 32) === 32 && tool !== 'move';
    const strokeTool: Tool = penEraser ? 'eraser' : tool;
    if (touchIsBlocked(event.pointerType, strokeTool)) {
      if (!palmGuardActive() && !pencilHintShownRef.current) {
        pencilHintShownRef.current = true;
        notify('Draw with the Pencil • fingers zoom and pan');
      }
      return;
    }
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is a convenience only. */ }
    activeStrokeToolRef.current = strokeTool;
    const point = pointFromClient(canvas, event.clientX, event.clientY)!;
    if (strokeTool === 'brush' || strokeTool === 'eraser') moveBrushCursor(point);
    pointers.current.set(event.pointerId, point);

    if ((event.button === 1 || (spaceHeld.current && event.button === 0)) && event.pointerType === 'mouse') {
      mousePan.current = { point: { x: event.clientX, y: event.clientY }, pan: { ...pan } };
      return;
    }

    if (strokeTool === 'fill') {
      fillTap.current = point;
      fillTapMoved.current = false;
      return;
    }
    if (strokeTool === 'move') {
      if (pointers.current.size > 1 && selectedId) return;
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (selected && hitRotateHandle(selected, point)) {
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
      if (selected && hitResizeHandle(selected, point)) {
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
    if (pointers.current.size === 1 || isPen) {
      if (stayInLines && (strokeTool === 'brush' || strokeTool === 'eraser')) {
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

  /** Every sample the device reported since the last frame (Apple Pencil sends up to 240 a second). */
  const pointerSamples = (event: React.PointerEvent<HTMLCanvasElement>): PointerSample[] => {
    const native = event.nativeEvent as PointerEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    if (!coalesced.length) return [{ clientX: event.clientX, clientY: event.clientY, pressure: event.pressure }];
    return coalesced.map((sample) => ({ clientX: sample.clientX, clientY: sample.clientY, pressure: sample.pressure }));
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const isPen = event.pointerType === 'pen';
    if (isPen) lastPenAtRef.current = performance.now();
    const activeTool = activeStrokeToolRef.current ?? tool;
    const tracked = pointers.current.has(event.pointerId);
    if (!tracked) {
      // Hovering Pencil or mouse: show where the brush will land.
      if ((tool === 'brush' || tool === 'eraser') && event.pointerType !== 'touch') {
        moveBrushCursor(pointFromClient(event.currentTarget, event.clientX, event.clientY));
      }
      return;
    }
    if (!isPen && (navigatingCanvas.current || (multiTouch.current && activeTool !== 'move'))) return;

    if (mousePan.current) {
      setPan(constrainPan(zoom, {
        x: mousePan.current.pan.x + event.clientX - mousePan.current.point.x,
        y: mousePan.current.pan.y + event.clientY - mousePan.current.point.y,
      }, displaySize, canvasRotation));
      return;
    }

    if ((activeTool === 'brush' || activeTool === 'eraser') && lastPoint.current && (pointers.current.size === 1 || isPen)) {
      const metrics = canvasMetrics(event.currentTarget);
      const response = 1 - smoothing * .82;
      let latest: Point | null = null;
      for (const sample of pointerSamples(event)) {
        const raw = canvasPointFromRect(metrics, sample.clientX, sample.clientY, canvasRotation, zoom)!;
        latest = raw;
        const from: Point | null = lastPoint.current;
        if (!from) break;
        const smoothedPoint: Point = {
          x: from.x + (raw.x - from.x) * response,
          y: from.y + (raw.y - from.y) * response,
        };
        if (Math.abs(smoothedPoint.x - from.x) + Math.abs(smoothedPoint.y - from.y) < .35) continue;
        drawLine(from, smoothedPoint, event.pointerType, sample.pressure || 1, activeTool);
        lastPoint.current = smoothedPoint;
      }
      if (latest) {
        pointers.current.set(event.pointerId, latest);
        moveBrushCursor(latest);
      }
      return;
    }

    const point = pointFromClient(event.currentTarget, event.clientX, event.clientY)!;
    if (activeTool === 'brush' || activeTool === 'eraser') moveBrushCursor(point);
    pointers.current.set(event.pointerId, point);

    if (activeTool === 'fill' && fillTap.current && Math.hypot(point.x - fillTap.current.x, point.y - fillTap.current.y) > 12) {
      fillTapMoved.current = true;
      return;
    }

    if (activeTool === 'move' && selectedId) {
      const selected = objectsRef.current.find((object) => object.id === selectedId);
      if (!selected) return;
      if (mouseRotate.current) {
        const angle = Math.atan2(point.y - selected.y, point.x - selected.x);
        updateObjects((items) => items.map((item) => item.id === mouseRotate.current!.id ? {
          ...item,
          rotation: mouseRotate.current!.rotation + angle - mouseRotate.current!.angle,
        } : item));
        objectChanged.current = true;
        return;
      }
      if (mouseResize.current) {
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
    }
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const isPen = event.pointerType === 'pen';
    if (isPen) {
      penDownRef.current = false;
      lastPenAtRef.current = performance.now();
    }
    if (!pointers.current.has(event.pointerId)) {
      if (event.pointerType === 'touch') moveBrushCursor(null);
      return;
    }
    const activeTool = activeStrokeToolRef.current ?? tool;
    const hadMultiplePointers = !isPen && screenPointers.current.size > 1;
    const releasedPoint = pointers.current.get(event.pointerId) ?? null;
    pointers.current.delete(event.pointerId);
    if (!isPen && (navigatingCanvas.current || multiTouch.current)) {
      moveBrushCursor(null);
      return;
    }
    if (mousePan.current) {
      mousePan.current = null;
      if (!screenPointers.current.size) notify(`Canvas zoom ${Math.round(zoom * 100)}%`);
      return;
    }

    if (activeTool === 'fill' && fillTap.current && !fillTapMoved.current && !hadMultiplePointers && event.type !== 'pointercancel') {
      fillAt(fillTap.current);
    }
    if (!pointers.current.size) {
      const painting = activeTool === 'brush' || activeTool === 'eraser';
      if (painting && lastPoint.current && !strokeStarted.current && releasedPoint && !hadMultiplePointers) {
        // A single tap leaves a dot.
        drawLine(lastPoint.current, { x: lastPoint.current.x + .1, y: lastPoint.current.y + .1 }, event.pointerType, event.pressure || lastPressureRef.current, activeTool);
      } else if (painting && lastPoint.current && strokeStarted.current && releasedPoint && !hadMultiplePointers) {
        drawLine(lastPoint.current, releasedPoint, event.pointerType, event.pressure || lastPressureRef.current, activeTool);
      }
      commitStrokeLayer();
      if (painting && strokeStarted.current) pushHistory();
      if (activeTool === 'move' && objectChanged.current) pushHistory();
      lastPoint.current = null;
      strokeStarted.current = false;
      fillTap.current = null;
      fillTapMoved.current = false;
      dragOffset.current = null;
      mouseResize.current = null;
      mouseRotate.current = null;
      gesture.current = null;
      activeRegionMaskRef.current = null;
      activeStrokeToolRef.current = null;
      objectChanged.current = false;
      endDrawing();
    }
    if (event.pointerType === 'touch') moveBrushCursor(null);
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
    playSound('whoosh');
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
    playSound('whoosh');
  };
  undoActionRef.current = () => { void undo(); };
  redoActionRef.current = () => { void redo(); };

  const addObject = (kind: ArtObject['kind'], sticker?: string) => {
    const object = newObject(kind, color, sticker, canvasSize.width, canvasSize.height);
    updateObjects((items) => [...items, object]);
    setSelectedId(object.id);
    setTool('move');
    setPanel(null);
    pushHistory();
    haptic(10);
    playSound('boing');
    sparkleAt({ x: object.x, y: object.y }, color, true);
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

  /** Wipe to a white page sized for how the tablet is being held. */
  const resetToBlankPage = (backing: HTMLCanvasElement) => {
    const size = blankPageSize();
    if (backing.width !== size.width || backing.height !== size.height) {
      backing.width = size.width;
      backing.height = size.height;
    }
    setCanvasSize(size);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCanvasRotation(0);
  };

  const clearArt = () => {
    const backing = backingRef.current;
    const context = backing?.getContext('2d');
    if (!context || !backing) return;
    resetToBlankPage(backing);
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
      // Big enough to stay crisp on Retina tablets, small enough for fast fills.
      const scale = longestSide > 2048 ? 2048 / longestSide : longestSide < 1600 ? 1600 / longestSide : 1;
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
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, padding, padding, imageWidth, imageHeight);
      context.strokeStyle = '#171823';
      context.lineWidth = 10;
      context.strokeRect(padding - 5, padding - 5, imageWidth + 10, imageHeight + 10);
      viewGesture.current = null;
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

  /**
   * Freeze the drawing on screen right now (the PNG encoder copies the pixels at
   * call time) and save it in the background, so screens can switch instantly.
   */
  const saveCurrentInBackground = () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) return persistDrawing(pending.snapshot, pending).catch(() => undefined);
    const profile = profileRef.current;
    const drawingId = drawingIdRef.current;
    if (!profile || !drawingId) return Promise.resolve();
    const identity = { profile, drawingId, title: drawingTitleRef.current, createdAt: drawingCreatedAtRef.current };
    const art = compositeArt();
    const frozen = snapshot();
    return frozen.then((current) => persistDrawing(current, identity, art)).catch(() => undefined);
  };

  const startNewDrawing = (title: string) => {
    const previousSave = saveCurrentInBackground();
    drawingIdRef.current = makeId();
    drawingTitleRef.current = title;
    drawingCreatedAtRef.current = Date.now();
    return previousSave;
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
    void startNewDrawing('Blank drawing');
    const backing = backingRef.current;
    const context = backing?.getContext('2d');
    if (context && backing) {
      resetToBlankPage(backing);
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, backing.width, backing.height);
      capturePageBase(backing);
      objectsRef.current = [];
      setObjects([]);
      setSelectedId(null);
      setRevision((value) => value + 1);
    }
    // Open the page now; the first history entry and save finish in the background.
    void commitCanvas('now');
    notify(sessionStarted ? 'Fresh canvas ready' : 'Blank canvas ready');
    beginSession();
  };

  const chooseContinue = () => {
    if (!sessionStarted && savedArtwork) {
      history.current = [savedArtwork];
      future.current = [];
      applySnapshot(savedArtwork);
      refreshHistoryState();
      notify('Welcome back!');
    } else if (!drawingIdRef.current) {
      void startNewDrawing(drawingTitleRef.current || 'Drawing');
      void commitCanvas('now');
    }
    beginSession();
  };

  const openNewCanvasChooser = () => {
    setPanel(null);
    setChooserOpen(true);
    setDrawingActive(false);
  };

  const selectLibraryPage = (src: string, title: string) => {
    void startNewDrawing(title);
    loadLibraryPage(src, title);
    beginSession();
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
      if (!drawingIdRef.current) void startNewDrawing('Drawing');
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
      const name = profileRef.current.name;
      // Freeze the picture and who it belongs to now, then celebrate straight away;
      // the save finishes behind the confetti even if a new page is opened.
      const identity = { profile: profileRef.current, drawingId: drawingIdRef.current!, title: drawingTitleRef.current, createdAt: drawingCreatedAtRef.current };
      const art = compositeArt();
      const frozen = snapshot();
      playSound('chime');
      setCelebration({ emoji: '⭐', label: 'Saved!' });
      await persistDrawing(await frozen, identity, art);
      notify(`Saved to ${name}’s drawings`);
    } catch {
      finishAfterCelebrationRef.current = false;
      playSound('nope');
      notify('Could not save that drawing. Try again.');
    } finally {
      setPanel(null);
    }
  };

  const finishCelebration = useCallback(() => {
    setCelebration(null);
    if (!finishAfterCelebrationRef.current) return;
    finishAfterCelebrationRef.current = false;
    setPanel(null);
    setChooserOpen(true);
    setDrawingActive(false);
  }, []);

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

  const palmGuardRef = useRef(palmGuardActive);
  palmGuardRef.current = palmGuardActive;
  const discardStrokeRef = useRef(() => {});
  discardStrokeRef.current = () => {
    const layer = strokeLayerRef.current;
    layer?.getContext('2d')?.clearRect(0, 0, layer.width, layer.height);
    strokeLayerActiveRef.current = false;
    activeStrokeToolRef.current = null;
    requestRender();
  };

  useEffect(() => {
    const stage = canvasStage;
    if (!stage) return;
    const tracker = createTouchTapTracker();
    let ignoring = false;

    const hasStylus = (event: TouchEvent) => Array.from(event.touches).some((touch) => (touch as Touch & { touchType?: string }).touchType === 'stylus');
    const onStart = (event: TouchEvent) => {
      if (ignoring) return;
      // Pencil plus a resting palm is not a two-finger undo tap.
      if (hasStylus(event) || palmGuardRef.current()) {
        ignoring = true;
        tracker.reset();
        return;
      }
      if (isUiTouchTarget(event.target) && tracker.maxFingers === 0) {
        ignoring = true;
        return;
      }
      if (event.touches.length >= 2) event.preventDefault();
      tracker.onStart(event);
    };
    const onMove = (event: TouchEvent) => {
      if (ignoring) return;
      tracker.onMove(event);
      if (event.touches.length >= 2 || tracker.maxFingers >= 2) event.preventDefault();
    };
    const onEnd = (event: TouchEvent) => {
      if (ignoring) {
        if (event.touches.length === 0) {
          ignoring = false;
          tracker.reset();
        }
        return;
      }
      const action = tracker.onEnd(event);
      if (event.touches.length > 0 || !action) return;
      if (palmGuardRef.current()) return;
      // Little hands often touch with two fingers by accident; no surprise undo.
      if (kidModeRef.current) return;
      discardStrokeRef.current();
      screenPointers.current.clear();
      viewPointerOnCanvas.current.clear();
      navigatingCanvas.current = false;
      multiTouch.current = null;
      viewGesture.current = null;
      pointers.current.clear();
      lastPoint.current = null;
      strokeStarted.current = false;
      fillTap.current = null;
      fillTapMoved.current = false;
      if (action === 'undo') {
        undoActionRef.current();
        notifyRef.current('Undo');
      } else {
        redoActionRef.current();
        notifyRef.current('Redo');
      }
    };

    stage.dataset.touchTap = 'ready';
    stage.addEventListener('touchstart', onStart, { passive: false, capture: true });
    stage.addEventListener('touchmove', onMove, { passive: false, capture: true });
    stage.addEventListener('touchend', onEnd, { capture: true });
    stage.addEventListener('touchcancel', onEnd, { capture: true });
    return () => {
      delete stage.dataset.touchTap;
      stage.removeEventListener('touchstart', onStart, true);
      stage.removeEventListener('touchmove', onMove, true);
      stage.removeEventListener('touchend', onEnd, true);
      stage.removeEventListener('touchcancel', onEnd, true);
    };
  }, [canvasStage]);

  const startColorDrag = useColorDropGesture({
    canvasRef: visibleRef,
    pointFromClient,
    previewColorDrop,
    clearFillPreview,
    fillAt,
    setColor: selectColor,
    onSelectBrush: selectBrush,
    activateFillTool: () => setTool('fill'),
    closePanels: () => setPanel(null),
    stopDrawing: () => setDrawingActive(false),
    setDragColor,
    setMessage,
    clearBrushCursor: () => moveBrushCursor(null),
    haptic,
    notify,
  });

  const selectedObject = objects.find((object) => object.id === selectedId) ?? null;

  return (
    <main className={`app-shell${kidMode ? ' is-kid' : ''}${focusMode ? ' is-focus' : ''}${drawingActive ? ' is-drawing' : ''}${leftHanded ? ' is-left-handed' : ''}${stayInLines ? ' is-line-safe' : ''}${chooserOpen || profileGateOpen ? ' is-choosing' : ''}${dragColor ? ' is-color-dropping' : ''}`}>
      <TopBar
        kidMode={kidMode}
        onGrownUpHint={() => { playSound('nope'); notify('Grown-ups: press and hold'); }}
        onDone={() => {
          finishAfterCelebrationRef.current = true;
          void saveToGallery();
        }}
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
        kidMode={kidMode}
        color={color}
        showToast={Boolean(kidMode && kidToastFor(message))}
        message={kidMode ? kidToastFor(message) ?? '' : message}
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
        stageRef={bindCanvasStage}
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
        brushCursorRef={brushCursorRef}
        onCanvasPointerDown={pointerDown}
        onCanvasPointerMove={pointerMove}
        onCanvasPointerUp={pointerUp}
        onCanvasPointerCancel={pointerUp}
        onCanvasPointerEnter={(event) => { if ((tool === 'brush' || tool === 'eraser') && event.pointerType !== 'touch') moveBrushCursor(pointFromClient(event.currentTarget, event.clientX, event.clientY)); }}
        onCanvasPointerLeave={() => { if (!pointers.current.size) moveBrushCursor(null); }}
      />

      <ToolDock
        kidMode={kidMode}
        color={color}
        canUndo={historyState.undo}
        onUndo={() => void undo()}
        tool={tool}
        panel={panel}
        stayInLines={stayInLines}
        onBrush={() => { chooseTool('brush'); setPanel(panel === 'brush' ? null : 'brush'); }}
        onStayInLines={toggleStayInLines}
        onEraser={() => chooseTool('eraser')}
        onFill={() => { chooseTool('fill'); if (!kidMode) notify('Tap an area, or drag a color onto it'); }}
        onMove={() => chooseTool('move')}
        onShapes={() => setPanel(panel === 'shapes' ? null : 'shapes')}
        onStickers={() => setPanel(panel === 'stickers' ? null : 'stickers')}
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
        pencilOnly={pencilOnly}
        penSeen={penSeen}
        kidMode={kidMode}
        soundOn={soundOn}
        onToggleKidMode={() => {
          setKidMode((value) => !value);
          setPanel(null);
          haptic(8);
        }}
        onToggleSound={() => {
          const next = !soundOn;
          setSoundEnabled(next);
          setSoundOn(next);
          if (next) playSound('chime');
        }}
        onTogglePencil={() => {
          const next = pencilOnly ? 'off' : 'on';
          setPencilPreference(next);
          setPanel(null);
          haptic(8);
          notify(next === 'on' ? '✏️ Stylus only • fingers zoom, pan and tap-undo' : '👆 Fingers can draw again');
        }}
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

      <Palette tool={tool} brushType={brushType} color={color} onBrush={selectBrush} onPalettePointerDown={startColorDrag} onCustomColor={selectColor} />
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ''; }} />
      <SparkleLayer bursts={bursts} />
      <Celebration
        show={Boolean(celebration)}
        emoji={celebration?.emoji ?? '⭐'}
        label={celebration?.label ?? ''}
        onDone={finishCelebration}
      />
      {dragColor && <div className={`color-drop-orb${fillPreviewActive ? ' is-over-target' : ''}`} style={{ left: dragColor.x, top: dragColor.y, backgroundColor: dragColor.color }} />}
    </main>
  );
}
