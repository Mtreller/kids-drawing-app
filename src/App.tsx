import { useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Rect, Stage, Star, Text, Transformer } from 'react-konva';
import type Konva from 'konva';

type Tool = 'select' | 'brush';
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

type Gesture = {
  id: string;
  startDistance: number;
  startAngle: number;
  startScaleX: number;
  startScaleY: number;
  startRotation: number;
};

const palette = [
  '#ff1744', '#ff5d9e', '#ff9f1c', '#ffd60a', '#80ed99', '#2dc653',
  '#00b4d8', '#48cae4', '#4361ee', '#7209b7', '#c77dff', '#f15bb5',
  '#8d5524', '#e0ac69', '#5b3a29', '#6b7280', '#111827', '#ffffff',
];

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const angle = (a: Touch, b: Touch) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;

export default function App() {
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#ff5d9e');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [objects, setObjects] = useState<ArtObject[]>([
    { id: uid(), kind: 'star', x: 280, y: 250, width: 150, height: 150, rotation: 0, fill: '#ffd60a' },
    { id: uid(), kind: 'sticker', x: 560, y: 320, width: 150, height: 150, rotation: 0, fill: '#fff', sticker: '🦄' },
  ]);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const gestureRef = useRef<Gesture | null>(null);
  const selected = useMemo(() => objects.find((item) => item.id === selectedId), [objects, selectedId]);

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
    const item: ArtObject = {
      id: uid(), kind, x: 450, y: 300, width: 150, height: 150,
      rotation: 0, fill: color, sticker,
    };
    setObjects((current) => [...current, item]);
    setTool('select');
    requestAnimationFrame(() => select(item.id));
  };

  const onTouchStart = (event: any) => {
    const touches = event.evt.touches as TouchList;
    if (touches.length !== 2 || !selectedId) return;
    const node = nodeRefs.current[selectedId] as Konva.Node | null;
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
    node.draggable(false);
  };

  const onTouchMove = (event: any) => {
    const gesture = gestureRef.current;
    const touches = event.evt.touches as TouchList;
    if (!gesture || touches.length !== 2) return;
    event.evt.preventDefault();
    const node = nodeRefs.current[gesture.id] as Konva.Node | null;
    if (!node) return;
    const ratio = Math.max(0.35, Math.min(4, distance(touches[0], touches[1]) / gesture.startDistance));
    node.scaleX(gesture.startScaleX * ratio);
    node.scaleY(gesture.startScaleY * ratio);
    node.rotation(gesture.startRotation + angle(touches[0], touches[1]) - gesture.startAngle);
    node.getLayer()?.batchDraw();
  };

  const onTouchEnd = () => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const node = nodeRefs.current[gesture.id] as Konva.Node | null;
    if (node) {
      updateObject(gesture.id, {
        rotation: node.rotation(),
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
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      offsetX: item.width / 2,
      offsetY: item.height / 2,
      draggable: tool === 'select',
      onClick: () => select(item.id),
      onTap: () => select(item.id),
      onDragEnd: (event: any) => updateObject(item.id, { x: event.target.x(), y: event.target.y() }),
      onTransformEnd: (event: any) => {
        const node = event.target as Konva.Node;
        updateObject(item.id, {
          x: node.x(), y: node.y(), rotation: node.rotation(),
          width: Math.max(50, node.width() * node.scaleX()),
          height: Math.max(50, node.height() * node.scaleY()),
        });
        node.scale({ x: 1, y: 1 });
      },
    };
    if (item.kind === 'circle') return <Circle key={item.id} {...common} radius={item.width / 2} width={item.width} height={item.height} fill={item.fill} opacity={0.7} stroke="#302b4a" strokeWidth={5} />;
    if (item.kind === 'star') return <Star key={item.id} {...common} numPoints={5} innerRadius={item.width * 0.22} outerRadius={item.width * 0.5} fill={item.fill} stroke="#302b4a" strokeWidth={5} />;
    if (item.kind === 'sticker') return <Text key={item.id} {...common} text={item.sticker ?? '⭐'} fontSize={item.width * 0.8} align="center" verticalAlign="middle" />;
    return <Rect key={item.id} {...common} fill={item.fill} opacity={0.7} stroke="#302b4a" strokeWidth={5} cornerRadius={18} />;
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">🎨 Color <b>Pop v2</b></div>
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}>☝️ Move</button>
        <button className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')}>🖌️ Draw</button>
        <button onClick={() => selectedId && setObjects((items) => items.filter((item) => item.id !== selectedId))}>🗑️</button>
      </header>

      <section className="workspace">
        <aside className="add-dock">
          <button onClick={() => add('rect')}>⬜</button>
          <button onClick={() => add('circle')}>⚪</button>
          <button onClick={() => add('star')}>⭐</button>
          <button onClick={() => add('sticker', '🦄')}>🦄</button>
          <button onClick={() => add('sticker', '🌈')}>🌈</button>
        </aside>

        <div className="canvas-card">
          <Stage
            width={900}
            height={620}
            className="konva-stage"
            onMouseDown={(event) => { if (event.target === event.target.getStage()) select(null); }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <Layer>
              <Rect x={0} y={0} width={900} height={620} fill="#fff" cornerRadius={24} />
              {objects.map(renderObject)}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                keepRatio
                borderStroke="#7557ff"
                anchorFill="#fff"
                anchorStroke="#7557ff"
                anchorSize={18}
                boundBoxFunc={(oldBox, newBox) => newBox.width < 50 || newBox.height < 50 ? oldBox : newBox}
              />
            </Layer>
          </Stage>
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="palette" aria-label="Color palette">
          {palette.map((item) => <button key={item} className={item === color ? 'swatch selected' : 'swatch'} style={{ background: item }} onClick={() => setColor(item)} />)}
        </div>
        <div className="gesture-help">
          <strong>{selected ? 'Selected object' : 'No object selected'}</strong>
          <span>One finger moves • two fingers resize and rotate</span>
        </div>
      </footer>
    </main>
  );
}
