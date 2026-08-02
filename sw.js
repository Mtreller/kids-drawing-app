const CACHE='color-pop-v7';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];

function enhanceHTML(html){
  const expandedColors="const colors=['#ff1744','#ff4d6d','#ff6b9d','#ff8fab','#ff9f1c','#ffb703','#ffd60a','#fff176','#c6ff00','#80ed99','#52b788','#2dc653','#00b4d8','#48cae4','#90e0ef','#4361ee','#3a0ca3','#7209b7','#9d4edd','#c77dff','#f15bb5','#ff70a6','#8d5524','#c68642','#e0ac69','#5b3a29','#6b7280','#111827','#ffffff'];";
  html=html.replace(/const colors=\[[^;]+;/,expandedColors);
  html=html.replace('.palette{display:flex;gap:7px;overflow-x:auto;padding:3px;scrollbar-width:none}', '.palette{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:5px 18px 7px 5px;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain;scroll-snap-type:x proximity;mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 18px),transparent 100%)}');
  html=html.replace('.swatch{width:40px;height:40px;min-width:40px;border-radius:50%;border:4px solid #fff;box-shadow:0 3px 0 #cfc7e5;touch-action:none}', '.swatch{width:42px;height:42px;min-width:42px;flex:0 0 42px;border-radius:50%;border:4px solid #fff;box-shadow:0 3px 0 #cfc7e5;touch-action:pan-x;scroll-snap-align:center}');
  html=html.replace(/function startColorDrag\(e,c,b\)\{.*?drop=null\}/s,`function startColorDrag(e,c,b){
    choose(c,b);
    const start={id:e.pointerId,x:e.clientX,y:e.clientY,c,b,timer:null,active:false};
    drop=start;
    const cleanup=()=>{clearTimeout(start.timer);document.removeEventListener('pointermove',pendingMove);document.removeEventListener('pointerup',pendingUp);document.removeEventListener('pointercancel',pendingCancel)};
    const activate=()=>{if(!drop||drop!==start)return;start.active=true;start.sx=start.x;start.sy=start.y;start.color=c;start.moved=true;const orb=$('#droporb');orb.style.left=start.x+'px';orb.style.top=start.y+'px';orb.style.background=c;orb.classList.add('show');paper.classList.toggle('drop-ready',inside(start.x,start.y));navigator.vibrate?.(18)};
    const pendingMove=ev=>{if(ev.pointerId!==start.id)return;const dx=ev.clientX-start.x,dy=ev.clientY-start.y;if(!start.active&&Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)){cleanup();drop=null;return}if(start.active){ev.preventDefault();colorMove(ev)}};
    const finish=ev=>{if(ev.pointerId!==start.id)return;cleanup();if(start.active)colorEnd(ev);else{choose(c,b);drop=null}};
    const pendingUp=ev=>finish(ev),pendingCancel=ev=>{cleanup();$('#droporb').classList.remove('show');paper.classList.remove('drop-ready');drop=null};
    start.timer=setTimeout(activate,220);
    document.addEventListener('pointermove',pendingMove,{passive:false});document.addEventListener('pointerup',pendingUp);document.addEventListener('pointercancel',pendingCancel)
  }
  function colorMove(e){if(!drop||!drop.active||e.pointerId!==drop.id)return;e.preventDefault();const orb=$('#droporb');orb.style.left=e.clientX+'px';orb.style.top=e.clientY+'px';orb.style.background=drop.c||drop.color;orb.classList.add('show');paper.classList.toggle('drop-ready',inside(e.clientX,e.clientY))}
  function inside(x,y){const r=canvas.getBoundingClientRect();return x>r.left+10&&x<r.right-10&&y>r.top+10&&y<r.bottom-10}
  function colorEnd(e){$('#droporb').classList.remove('show');paper.classList.remove('drop-ready');if(drop?.active&&inside(e.clientX,e.clientY)){saveState();const p=pos(e.clientX,e.clientY);flood(p.x,p.y,drop.c||drop.color);setTool('fill')}drop=null}`);
  return html;
}

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/kids-drawing-app/')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>{
      const text=enhanceHTML(await r.text());
      return new Response(text,{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})
    }).catch(()=>caches.match('./index.html').then(async r=>r?new Response(enhanceHTML(await r.text()),{headers:{'Content-Type':'text/html; charset=utf-8'}}):Response.error())));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});