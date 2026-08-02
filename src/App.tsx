import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage, Star, Text, Transformer } from 'react-konva';
import type Konva from 'konva';

type Tool = 'select' | 'brush' | 'eraser';
type ArtObject = {
  id: string;
  kind: 'rect' | 'circle' | 'star' | 'sticker';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  sticker?: string;
};
type Stroke = { id: string; points: number[]; color: string; width: number; erase: boolean };
type Scene = { objects: ArtObject[]; strokes: Stroke[] };
type Gesture = {
  id: string;
  startDistance: number;
  startAngle: number;
  startScaleX: number;
  startScaleY: number;
  startRotation: number;
};

const ART_WIDTH = 900;
const ART_HEIGHT = 620;
const palette = [
  '#ff1744', '#ff5d9e', '#ff8fab', '#ff9f1c', '#ffb703', '#ffd60a',
  '#80ed99', '#52b788', '#2dc653', '#00b4d8', '#48cae4', '#4361ee',
  '#3a0ca3', '#7209b7', '#9d4edd', '#c77dff', '#f15bb5', '#8d5524',
  '#c68642', '#e0ac69', '#5b3a29', '#6b7280', '#111827', '#ffffff',
];
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const angle = (a: Touch, b: Touch) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
const cloneScene = (objects: ArtObject[], strokes: Stroke[]): Scene => ({
  objects: objects.map((item) => ({ ...item })),
  strokes: strokes.map((item) => ({ ...item, points: [...item.points] })),
});

export default function App() {
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#ff5d9e');
  const [brushSize, setBrushSize] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [objects, setObjects] = useState<ArtObject[]>([
    { id: uid(), kind: 'star', x: 280, y: 250, width: 150, height: 150, rotation: 0, fill: '#ffd60a' },
    { id: uid(), kind: 'sticker', x: 560, y: 320, width: 150, height: 150, rotation: 0, fill: '#fff', sticker: '🦄' },
  ]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [history, setHistory] = useState<Scene[]>([]);
  const [future, setFuture] = useState<Scene[]>([]);
  const [stageSize, setStageSize] = useState({ width: ART_WIDTH, height: ART_HEIGHT, scale: 1 });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const gestureRef = useRef<Gesture | null>(null);
  const drawingRef = useRef(false);
  const selected = useMemo(() => objects.find((item) => item.id === selectedId), [objects, selectedId]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      const availableWidth = Math.max(260, rect.width - (rect.width < 720 ? 68 : 118));
      const availableHeight = Math.max(220, rect.height - 24);
      const scale = Math.min(availableWidth / ART_WIDTH, availableHeight / ART_HEIGHT, 1.35);
      setStageSize({ width: ART_WIDTH * scale, height: ART_HEIGHT * scale, scale });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pushHistory = () => {
    setHistory((items) => [...items.slice(-39), cloneScene(objects, strokes)]);
    setFuture([]);
  };
  const restore = (scene: Scene) => {
    setObjects(scene.objects.map((item) => ({ ...item })));
    setStrokes(scene.strokes.map((item) => ({ ...item, points: [...item.points] })));
    setSelectedId(null);
    transformerRef.current?.nodes([]);
  };
  const undo = () => {
    const scene = history.at(-1);
    if (!scene) return;
    setFuture((items) => [...items, cloneScene(objects, strokes)]);
    setHistory((items) => items.slice(0, -1));
    restore(scene);
  };
  const redo = () => {
    const scene = future.at(-1);
    if (!scene) return;
    setHistory((items) => [...items, cloneScene(objects, strokes)]);
    setFuture((items) => items.slice(0, -1));
    restore(scene);
  };
  const updateObject = (id: string, patch: Partial<ArtObject>) => {
    setObjects((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const select = (id: string | null) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      const node = id ? nodeRefs.current[id] : null;
      transformerRef.current?.nodes(node ? [node] : []);
      transformerRef.current?.getLayer()?.batchDraw();
    });
  };
  const add = (kind: ArtObject['kind'], sticker?: string) => {
    pushHistory();
    const item: ArtObject = { id: uid(), kind, x: 450, y: 310, width: 150, height: 150, rotation: 0, fill: color, sticker };
    setObjects((current) => [...current, item]);
    setTool('select');
    requestAnimationFrame(() => select(item.id));
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setObjects((items) => items.filter((item) => item.id !== selectedId));
    select(null);
  };
  const recolorSelected = () => {
    if (!selectedId) return;
    pushHistory();
    updateObject(selectedId, { fill: color });
  };

  const logicalPointer = () => {
    const point = stageRef.current?.getPointerPosition();
    return point ? { x: point.x / stageSize.scale, y: point.y / stageSize.scale } : null;
  };
  const beginStroke = () => {
    if (tool !== 'brush' && tool !== 'eraser') return;
    const point = logicalPointer();
    if (!point) return;
    pushHistory();
    drawingRef.current = true;
    setStrokes((items) => [...items, { id: uid(), points: [point.x, point.y], color, width: brushSize, erase: tool === 'eraser' }]);
  };
  const continueStroke = () => {
    if (!drawingRef.current) return;
    const point = logicalPointer();
    if (!point) return;
    setStrokes((items) => {
      const next = [...items];
      const last = next.at(-1);
      if (!last) return items;
      next[next.length - 1] = { ...last, points: [...last.points, point.x, point.y] };
      return next;
    });
  };
  const endStroke = () => { drawingRef.current = false; };

  const onTouchStart = (event: any) => {
    const touches = event.evt.touches as TouchList;
    if (touches.length === 2 && selectedId && tool === 'select') {
      const node = nodeRefs.current[selectedId];
      if (!node) return;
      event.evt.preventDefault();
      gestureRef.current = {
        id: selectedId,
        startDistance: distance(touches[0], touches[1]),
        startAngle: angle(touches[0], touches[1]),
        startScaleX: node.scaleX(),
        startScaleY: node.scaleY(),
        startRotation: node.rotation(),
      };
      pushHistory();
      node.draggable(false);
      navigator.vibrate?.(12);
      return;
    }
    if (touches.length === 1) beginStroke();
  };
  const onTouchMove = (event: any) => {
    const gesture = gestureRef.current;
    const touches = event.evt.touches as TouchList;
    if (gesture && touches.length === 2) {
      event.evt.preventDefault();
      const node = nodeRefs.current[gesture.id];
      if (!node) return;
      const ratio = Math.max(0.35, Math.min(4, distance(touches[0], touches[1]) / gesture.startDistance));
      node.scale({ x: gesture.startScaleX * ratio, y: gesture.startScaleY * ratio });
      node.rotation(gesture.startRotation + angle(touches[0], touches[1]) - gesture.startAngle);
      node.getLayer()?.batchDraw();
      return;
    }
    continueStroke();
  };
  const onTouchEnd = () => {
    endStroke();
    const gesture = gestureRef.current;
    if (!gesture) return;
    const node = nodeRefs.current[gesture.id];
    if (node) {
      updateObject(gesture.id, {
        x: node.x(), y: node.y(), rotation: node.rotation(),
        width: Math.max(50, node.width() * node.scaleX()),
        height: Math.max(50, node.height() * node.scaleY()),
      });
      node.scale({ x: 1, y: 1 });
      node.draggable(true);
    }
    gestureRef.current = null;
  };

  const renderObject = (item: ArtObject) => {
    const common = {
      ref: (node: Konva.Node | null) => { nodeRefs.current[item.id] = node; },
      x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation,
      offsetX: item.width / 2, offsetY: item.height / 2, draggable: tool === 'select',
      onClick: () => select(item.id), onTap: () => select(item.id),
      onDragStart: pushHistory,
      onDragEnd: (event: any) => updateObject(item.id, { x: event.target.x(), y: event.target.y() }),
      onTransformStart: pushHistory,
      onTransformEnd: (event: any) => {
        const node = event.target as Konva.Node;
        updateObject(item.id, {
          x: node.x(), y: node.y(), rotation: node.rotation(),
          width: Math.max(50, node.width() * node.scaleX()), height: Math.max(50, node.height() * node.scaleY()),
        });
        node.scale({ x: 1, y: 1 });
      },
    };
    if (item.kind === 'circle') return <Circle key={item.id} {...common} radius={item.width / 2} fill={item.fill} opacity={0.78} stroke="#302b4a" strokeWidth={5} />;
    if (item.kind === 'star') return <Star key={item.id} {...common} numPoints={5} innerRadius={item.width * 0.22} outerRadius={item.width * 0.5} fill={item.fill} stroke="#302b4a" strokeWidth={5} />;
    if (item.kind === 'sticker') return <Text key={item.id} {...common} text={item.sticker ?? '⭐'} fontSize={item.width * 0.8} align="center" verticalAlign="middle" />;
    return <Rect key={item.id} {...common} fill={item.fill} opacity={0.78} stroke="#302b4a" strokeWidth={5} cornerRadius={18} />;
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">🎨 Color <b>Pop v2</b></div>
        <div className="tool-group">
          <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}>☝️ <span>Move</span></button>
          <button className={tool === 'brush' ? 'active' : ''} onClick={() => { setTool('brush'); select(null); }}>🖌️ <span>Draw</span></button>
          <button className={tool === 'eraser' ? 'active' : ''} onClick={() => { setTool('eraser'); select(null); }}>🧽 <span>Erase</span></button>
        </div>
        <div className="tool-group">
          <button disabled={!history.length} onClick={undo}>↩️</button>
          <button disabled={!future.length} onClick={redo}>↪️</button>
          <button disabled={!selectedId} onClick={deleteSelected}>🗑️</button>
        </div>
      </header>

      <section className="workspace" ref={workspaceRef}>
        <aside className="add-dock">
          <button onClick={() => add('rect')} aria-label="Add square">⬜</button>
          <button onClick={() => add('circle')} aria-label="Add circle">⚪</button>
          <button onClick={() => add('star')} aria-label="Add star">⭐</button>
          <button onClick={() => add('sticker', '🦄')} aria-label="Add unicorn">🦄</button>
          <button onClick={() => add('sticker', '🌈')} aria-label="Add rainbow">🌈</button>
        </aside>
        <div className="canvas-card" style={{ width: stageSize.width, height: stageSize.height }}>
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={stageSize.scale}
            scaleY={stageSize.scale}
            className="konva-stage"
            onMouseDown={(event) => {
              if (tool === 'select' && event.target === event.target.getStage()) select(null);
              if (tool !== 'select') beginStroke();
            }}
            onMouseMove={continueStroke}
            onMouseUp={endStroke}
            onMouseLeave={endStroke}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <Layer>
              <Rect x={0} y={0} width={ART_WIDTH} height={ART_HEIGHT} fill="#fff" cornerRadius={24} />
              {strokes.map((stroke) => (
                <Line key={stroke.id} points={stroke.points} stroke={stroke.color} strokeWidth={stroke.width} lineCap="round" lineJoin="round" tension={0.25} globalCompositeOperation={stroke.erase ? 'destination-out' : 'source-over'} listening={false} />
              ))}
              {objects.map(renderObject)}
              <Transformer ref={transformerRef} rotateEnabled flipEnabled={false} keepRatio borderStroke="#7557ff" borderStrokeWidth={3} anchorFill="#fff" anchorStroke="#7557ff" anchorStrokeWidth={3} anchorSize={18} boundBoxFunc={(oldBox, newBox) => newBox.width < 50 || newBox.height < 50 ? oldBox : newBox} />
            </Layer>
          </Stage>
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="palette" aria-label="Color palette">
          {palette.map((item) => <button key={item} aria-label={`Choose ${item}`} className={item === color ? 'swatch selected' : 'swatch'} style={{ background: item }} onClick={() => setColor(item)} />)}
        </div>
        <div className="brush-control">
          <span>●</span><input aria-label="Brush size" type="range" min="3" max="60" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /><strong>{brushSize}</strong>
        </div>
        <div className="context-actions">
          <button disabled={!selectedId} onClick={recolorSelected}>🎨 Recolor</button>
          <div className="gesture-help"><strong>{selected ? 'Object selected' : tool === 'select' ? 'Tap an object' : 'Draw on the page'}</strong><span>One finger moves • two fingers resize and rotate</span></div>
        </div>
      </footer>
    </main>
  );
}
