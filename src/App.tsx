import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage, Star, Text, Transformer } from 'react-konva';
import type Konva from 'konva';

type Tool = 'select' | 'brush' | 'eraser';
type ArtObject = { id:string; kind:'rect'|'circle'|'star'|'sticker'; x:number; y:number; width:number; height:number; rotation:number; fill:string; sticker?:string };
type Stroke = { id:string; points:number[]; color:string; width:number; erase:boolean };
type Scene = { objects:ArtObject[]; strokes:Stroke[] };
type Gesture = { id:string; startDistance:number; startAngle:number; startScaleX:number; startScaleY:number; startRotation:number };
type DropState = { color:string; x:number; y:number; active:boolean; targetId:string|null } | null;

const ART_WIDTH=900, ART_HEIGHT=620;
const palette=['#ff1744','#ff5d9e','#ff8fab','#ff9f1c','#ffb703','#ffd60a','#80ed99','#52b788','#2dc653','#00b4d8','#48cae4','#4361ee','#3a0ca3','#7209b7','#9d4edd','#c77dff','#f15bb5','#8d5524','#c68642','#e0ac69','#5b3a29','#6b7280','#111827','#ffffff'];
const uid=()=>crypto.randomUUID?.()??`${Date.now()}-${Math.random()}`;
const distance=(a:Touch,b:Touch)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
const angle=(a:Touch,b:Touch)=>Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI;
const cloneScene=(objects:ArtObject[],strokes:Stroke[]):Scene=>({objects:objects.map(x=>({...x})),strokes:strokes.map(x=>({...x,points:[...x.points]}))});

export default function App(){
 const [tool,setTool]=useState<Tool>('select');
 const [color,setColor]=useState('#ff5d9e');
 const [brushSize,setBrushSize]=useState(16);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [hoverId,setHoverId]=useState<string|null>(null);
 const [drop,setDrop]=useState<DropState>(null);
 const [message,setMessage]=useState('Drag a color onto a shape to fill it');
 const [objects,setObjects]=useState<ArtObject[]>([
  {id:uid(),kind:'star',x:280,y:250,width:150,height:150,rotation:0,fill:'#ffd60a'},
  {id:uid(),kind:'sticker',x:560,y:320,width:150,height:150,rotation:0,fill:'#fff',sticker:'🦄'}
 ]);
 const [strokes,setStrokes]=useState<Stroke[]>([]),[history,setHistory]=useState<Scene[]>([]),[future,setFuture]=useState<Scene[]>([]);
 const [stageSize,setStageSize]=useState({width:ART_WIDTH,height:ART_HEIGHT,scale:1});
 const workspaceRef=useRef<HTMLDivElement>(null),stageRef=useRef<Konva.Stage>(null),transformerRef=useRef<Konva.Transformer>(null);
 const nodeRefs=useRef<Record<string,Konva.Node|null>>({}),gestureRef=useRef<Gesture|null>(null),drawingRef=useRef(false),dropCleanupRef=useRef<(()=>void)|null>(null);
 const selected=useMemo(()=>objects.find(x=>x.id===selectedId),[objects,selectedId]);

 useEffect(()=>{const el=workspaceRef.current;if(!el)return;const resize=()=>{const r=el.getBoundingClientRect(),aw=Math.max(260,r.width-(r.width<720?68:118)),ah=Math.max(220,r.height-24),scale=Math.min(aw/ART_WIDTH,ah/ART_HEIGHT,1.35);setStageSize({width:ART_WIDTH*scale,height:ART_HEIGHT*scale,scale})};resize();const o=new ResizeObserver(resize);o.observe(el);return()=>o.disconnect()},[]);
 useEffect(()=>()=>dropCleanupRef.current?.(),[]);

 const pushHistory=()=>{setHistory(items=>[...items.slice(-39),cloneScene(objects,strokes)]);setFuture([])};
 const restore=(scene:Scene)=>{setObjects(scene.objects.map(x=>({...x})));setStrokes(scene.strokes.map(x=>({...x,points:[...x.points]})));setSelectedId(null);transformerRef.current?.nodes([])};
 const undo=()=>{const scene=history.at(-1);if(!scene)return;setFuture(x=>[...x,cloneScene(objects,strokes)]);setHistory(x=>x.slice(0,-1));restore(scene)};
 const redo=()=>{const scene=future.at(-1);if(!scene)return;setHistory(x=>[...x,cloneScene(objects,strokes)]);setFuture(x=>x.slice(0,-1));restore(scene)};
 const updateObject=(id:string,patch:Partial<ArtObject>)=>setObjects(items=>items.map(x=>x.id===id?{...x,...patch}:x));
 const select=(id:string|null)=>{setSelectedId(id);requestAnimationFrame(()=>{const node=id?nodeRefs.current[id]:null;transformerRef.current?.nodes(node?[node]:[]);transformerRef.current?.getLayer()?.batchDraw()})};
 const add=(kind:ArtObject['kind'],sticker?:string)=>{pushHistory();const item={id:uid(),kind,x:450,y:310,width:150,height:150,rotation:0,fill:color,sticker};setObjects(x=>[...x,item]);setTool('select');requestAnimationFrame(()=>select(item.id))};
 const deleteSelected=()=>{if(!selectedId)return;pushHistory();setObjects(x=>x.filter(o=>o.id!==selectedId));select(null)};
 const recolorSelected=()=>{if(!selectedId)return;pushHistory();updateObject(selectedId,{fill:color})};

 const logicalPointer=()=>{const p=stageRef.current?.getPointerPosition();return p?{x:p.x/stageSize.scale,y:p.y/stageSize.scale}:null};
 const beginStroke=()=>{if(tool!=='brush'&&tool!=='eraser')return;const p=logicalPointer();if(!p)return;pushHistory();drawingRef.current=true;setStrokes(x=>[...x,{id:uid(),points:[p.x,p.y],color,width:brushSize,erase:tool==='eraser'}])};
 const continueStroke=()=>{if(!drawingRef.current)return;const p=logicalPointer();if(!p)return;setStrokes(items=>{const next=[...items],last=next.at(-1);if(!last)return items;next[next.length-1]={...last,points:[...last.points,p.x,p.y]};return next})};
 const endStroke=()=>{drawingRef.current=false};

 const onTouchStart=(event:any)=>{const touches=event.evt.touches as TouchList;if(touches.length===2&&selectedId&&tool==='select'){const node=nodeRefs.current[selectedId];if(!node)return;event.evt.preventDefault();gestureRef.current={id:selectedId,startDistance:distance(touches[0],touches[1]),startAngle:angle(touches[0],touches[1]),startScaleX:node.scaleX(),startScaleY:node.scaleY(),startRotation:node.rotation()};pushHistory();node.draggable(false);navigator.vibrate?.(12);return}if(touches.length===1)beginStroke()};
 const onTouchMove=(event:any)=>{const g=gestureRef.current,touches=event.evt.touches as TouchList;if(g&&touches.length===2){event.evt.preventDefault();const node=nodeRefs.current[g.id];if(!node)return;const ratio=Math.max(.35,Math.min(4,distance(touches[0],touches[1])/g.startDistance));node.scale({x:g.startScaleX*ratio,y:g.startScaleY*ratio});node.rotation(g.startRotation+angle(touches[0],touches[1])-g.startAngle);node.getLayer()?.batchDraw();return}continueStroke()};
 const onTouchEnd=()=>{endStroke();const g=gestureRef.current;if(!g)return;const node=nodeRefs.current[g.id];if(node){updateObject(g.id,{x:node.x(),y:node.y(),rotation:node.rotation(),width:Math.max(50,node.width()*node.scaleX()),height:Math.max(50,node.height()*node.scaleY())});node.scale({x:1,y:1});node.draggable(true)}gestureRef.current=null};

 const stagePointFromClient=(x:number,y:number)=>{const box=stageRef.current?.container().getBoundingClientRect();if(!box)return null;return{x:(x-box.left)/stageSize.scale,y:(y-box.top)/stageSize.scale}};
 const targetAt=(x:number,y:number)=>{const p=stagePointFromClient(x,y),stage=stageRef.current;if(!p||!stage||p.x<0||p.y<0||p.x>ART_WIDTH||p.y>ART_HEIGHT)return null;const hit=stage.getIntersection({x:p.x*stageSize.scale,y:p.y*stageSize.scale});const id=hit?.id();return id&&objects.some(o=>o.id===id)?id:null};
 const startColorDrop=(event:React.PointerEvent<HTMLButtonElement>,nextColor:string)=>{
  setColor(nextColor);const startX=event.clientX,startY=event.clientY,pointerId=event.pointerId;let active=false,timer=window.setTimeout(()=>{active=true;setDrop({color:nextColor,x:startX,y:startY,active:true,targetId:null});navigator.vibrate?.(15)},180);
  const move=(e:PointerEvent)=>{if(e.pointerId!==pointerId)return;const dx=e.clientX-startX,dy=e.clientY-startY;if(!active&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){cleanup();return}if(!active)return;e.preventDefault();const targetId=targetAt(e.clientX,e.clientY);setHoverId(targetId);setDrop({color:nextColor,x:e.clientX,y:e.clientY,active:true,targetId})};
  const finish=(e:PointerEvent)=>{if(e.pointerId!==pointerId)return;const targetId=active?targetAt(e.clientX,e.clientY):null;if(active&&targetId){pushHistory();updateObject(targetId,{fill:nextColor});setMessage('Color dropped! Drag another color to keep filling.');navigator.vibrate?.(22)}else if(active)setMessage('Drop the color directly onto a shape.');cleanup()};
  const cancel=()=>cleanup();
  const cleanup=()=>{clearTimeout(timer);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);setDrop(null);setHoverId(null);dropCleanupRef.current=null};
  dropCleanupRef.current=cleanup;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel)
 };

 const renderObject=(item:ArtObject)=>{const common={id:item.id,ref:(node:Konva.Node|null)=>{nodeRefs.current[item.id]=node},x:item.x,y:item.y,width:item.width,height:item.height,rotation:item.rotation,offsetX:item.width/2,offsetY:item.height/2,draggable:tool==='select'&&!drop,onClick:()=>select(item.id),onTap:()=>select(item.id),onDragStart:pushHistory,onDragEnd:(e:any)=>updateObject(item.id,{x:e.target.x(),y:e.target.y()}),onTransformStart:pushHistory,onTransformEnd:(e:any)=>{const node=e.target as Konva.Node;updateObject(item.id,{x:node.x(),y:node.y(),rotation:node.rotation(),width:Math.max(50,node.width()*node.scaleX()),height:Math.max(50,node.height()*node.scaleY())});node.scale({x:1,y:1})},shadowColor:hoverId===item.id?'#7557ff':undefined,shadowBlur:hoverId===item.id?24:0,shadowOpacity:.8};
  if(item.kind==='circle')return <Circle key={item.id}{...common} radius={item.width/2} fill={item.fill} opacity=.78 stroke={hoverId===item.id?'#7557ff':'#302b4a'} strokeWidth={hoverId===item.id?9:5}/>;
  if(item.kind==='star')return <Star key={item.id}{...common} numPoints={5} innerRadius={item.width*.22} outerRadius={item.width*.5} fill={item.fill} stroke={hoverId===item.id?'#7557ff':'#302b4a'} strokeWidth={hoverId===item.id?9:5}/>;
  if(item.kind==='sticker')return <Text key={item.id}{...common} text={item.sticker??'⭐'} fontSize={item.width*.8} align="center" verticalAlign="middle"/>;
  return <Rect key={item.id}{...common} fill={item.fill} opacity=.78 stroke={hoverId===item.id?'#7557ff':'#302b4a'} strokeWidth={hoverId===item.id?9:5} cornerRadius={18}/>};

 return <main className="app-shell">
  <header className="topbar"><div className="brand">🎨 Color <b>Pop v2</b></div><div className="tool-group"><button className={tool==='select'?'active':''} onClick={()=>setTool('select')}>☝️ <span>Move</span></button><button className={tool==='brush'?'active':''} onClick={()=>{setTool('brush');select(null)}}>🖌️ <span>Draw</span></button><button className={tool==='eraser'?'active':''} onClick={()=>{setTool('eraser');select(null)}}>🧽 <span>Erase</span></button></div><div className="tool-group"><button disabled={!history.length} onClick={undo}>↩️</button><button disabled={!future.length} onClick={redo}>↪️</button><button disabled={!selectedId} onClick={deleteSelected}>🗑️</button></div></header>
  <section className={drop?.active?'workspace color-drop-active':'workspace'} ref={workspaceRef}><aside className="add-dock"><button onClick={()=>add('rect')}>⬜</button><button onClick={()=>add('circle')}>⚪</button><button onClick={()=>add('star')}>⭐</button><button onClick={()=>add('sticker','🦄')}>🦄</button><button onClick={()=>add('sticker','🌈')}>🌈</button></aside><div className="canvas-card" style={{width:stageSize.width,height:stageSize.height}}><Stage ref={stageRef} width={stageSize.width} height={stageSize.height} scaleX={stageSize.scale} scaleY={stageSize.scale} className="konva-stage" onMouseDown={e=>{if(tool==='select'&&e.target===e.target.getStage())select(null);if(tool!=='select')beginStroke()}} onMouseMove={continueStroke} onMouseUp={endStroke} onMouseLeave={endStroke} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}><Layer><Rect x={0} y={0} width={ART_WIDTH} height={ART_HEIGHT} fill="#fff" cornerRadius={24}/>{strokes.map(s=><Line key={s.id} points={s.points} stroke={s.color} strokeWidth={s.width} lineCap="round" lineJoin="round" tension={.25} globalCompositeOperation={s.erase?'destination-out':'source-over'} listening={false}/>)}{objects.map(renderObject)}<Transformer ref={transformerRef} rotateEnabled flipEnabled={false} keepRatio borderStroke="#7557ff" borderStrokeWidth={3} anchorFill="#fff" anchorStroke="#7557ff" anchorStrokeWidth={3} anchorSize={18} boundBoxFunc={(oldBox,newBox)=>newBox.width<50||newBox.height<50?oldBox:newBox}/></Layer></Stage></div><div className="drop-hint">{drop?.active?(hoverId?'Release to fill':'Move over a shape'):message}</div></section>
  <footer className="bottom-bar"><div className="palette" aria-label="Color palette">{palette.map(item=><button key={item} aria-label={`Drag ${item} to fill`} className={item===color?'swatch selected':'swatch'} style={{background:item}} onPointerDown={e=>startColorDrop(e,item)}/>)}</div><div className="brush-control"><span>●</span><input aria-label="Brush size" type="range" min="3" max="60" value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))}/><strong>{brushSize}</strong></div><div className="context-actions"><button disabled={!selectedId} onClick={recolorSelected}>🎨 Recolor</button><div className="gesture-help"><strong>{selected?'Object selected':tool==='select'?'Tap an object':'Draw on the page'}</strong><span>Hold and drag a color to fill • swipe palette to scroll</span></div></div></footer>
  {drop?.active&&<div className="color-drop-orb" style={{left:drop.x,top:drop.y,background:drop.color}}/>}
 </main>
}
