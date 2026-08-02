const CACHE='color-pop-v8';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];

function enhanceHTML(html){
  const expandedColors="const colors=['#ff1744','#ff4d6d','#ff6b9d','#ff8fab','#ff9f1c','#ffb703','#ffd60a','#fff176','#c6ff00','#80ed99','#52b788','#2dc653','#00b4d8','#48cae4','#90e0ef','#4361ee','#3a0ca3','#7209b7','#9d4edd','#c77dff','#f15bb5','#ff70a6','#8d5524','#c68642','#e0ac69','#5b3a29','#6b7280','#111827','#ffffff'];";
  html=html.replace(/const colors=\[[^;]+;/,expandedColors);

  html=html.replace('</style>',`
.probar{position:absolute;z-index:30;left:12px;top:50%;transform:translateY(-50%);display:grid;gap:10px;padding:10px 8px;border-radius:22px;background:rgba(255,255,255,.92);border:2px solid #fff;box-shadow:0 12px 34px rgba(54,36,84,.22);backdrop-filter:blur(12px)}
.procontrol{display:grid;justify-items:center;gap:5px;font-size:11px;font-weight:950;color:#51496b}.procontrol input{writing-mode:vertical-lr;direction:rtl;width:28px;height:112px;accent-color:var(--purple)}.provalue{min-width:38px;padding:4px 6px;border-radius:10px;background:#eee9f8;text-align:center;font-size:11px}.activecolor{width:38px;height:38px;border-radius:50%;border:5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.2);background:#ff1744}.quickbtn{position:absolute;z-index:31;left:14px;bottom:14px;width:48px;height:48px;border-radius:16px;background:rgba(48,43,74,.9);color:#fff;font-size:22px;box-shadow:0 5px 16px rgba(48,43,74,.28)}.quickmenu{position:absolute;z-index:32;left:14px;bottom:70px;display:grid;gap:7px;padding:8px;border-radius:18px;background:rgba(255,255,255,.96);border:2px solid #fff;box-shadow:0 14px 40px rgba(44,28,69,.25);transform:translateY(10px) scale(.96);opacity:0;pointer-events:none;transition:.16s;transform-origin:bottom left}.quickmenu.show{transform:none;opacity:1;pointer-events:auto}.quickaction{height:42px;min-width:130px;border-radius:13px;background:#f3effa;color:var(--ink);font-weight:950;text-align:left;padding:7px 11px}.focus-toggle{position:absolute;z-index:31;right:14px;bottom:14px;width:48px;height:48px;border-radius:16px;background:rgba(48,43,74,.9);color:#fff;font-size:20px;box-shadow:0 5px 16px rgba(48,43,74,.28)}body.focus-mode .top,body.focus-mode .bottom{display:none}body.focus-mode .app{grid-template-rows:minmax(0,1fr);padding:max(6px,env(safe-area-inset-top)) 6px max(6px,env(safe-area-inset-bottom))}body.focus-mode .stage{border-radius:18px}.gesture-toast{position:absolute;z-index:50;left:50%;bottom:18px;transform:translate(-50%,14px);opacity:0;background:rgba(48,43,74,.9);color:#fff;border-radius:999px;padding:8px 14px;font-weight:900;pointer-events:none;transition:.18s}.gesture-toast.show{opacity:1;transform:translate(-50%,0)}
.palette{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:5px 18px 7px 5px;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain;scroll-snap-type:x proximity;mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 18px),transparent 100%)}.swatch{width:42px;height:42px;min-width:42px;flex:0 0 42px;border-radius:50%;border:4px solid #fff;box-shadow:0 3px 0 #cfc7e5;touch-action:pan-x;scroll-snap-align:center}
@media(max-width:760px){.probar{left:7px;padding:8px 6px;border-radius:18px}.procontrol input{height:88px}.quickbtn{left:9px;bottom:9px}.quickmenu{left:9px;bottom:64px}.focus-toggle{right:9px;bottom:9px}}
</style>`);

  html=html.replace('<div class="panel tray" id="tray"></div></section>',`<div class="panel tray" id="tray"></div>
<div class="probar" aria-label="Brush controls"><div class="activecolor" id="activeColor" title="Current color"></div><label class="procontrol">Size<input id="proSize" type="range" min="3" max="70" value="15"><span class="provalue" id="sizeValue">15</span></label><label class="procontrol">Opacity<input id="opacity" type="range" min="10" max="100" value="100"><span class="provalue" id="opacityValue">100%</span></label></div>
<button class="quickbtn" id="quickBtn" aria-label="Quick actions">⚡</button><div class="quickmenu" id="quickMenu"><button class="quickaction" data-quick="fit">⤢ Fit canvas</button><button class="quickaction" data-quick="drawings">📚 Drawings</button><button class="quickaction" data-quick="blank">✨ New blank</button><button class="quickaction" data-quick="save">💾 Save artwork</button></div><button class="focus-toggle" id="focusToggle" aria-label="Focus mode">⛶</button><div class="gesture-toast" id="gestureToast"></div></section>`);

  html=html.replace(/function startColorDrag\(e,c,b\)\{.*?drop=null\}/s,`function startColorDrag(e,c,b){
    choose(c,b);
    const start={id:e.pointerId,x:e.clientX,y:e.clientY,c,b,timer:null,active:false};drop=start;
    const cleanup=()=>{clearTimeout(start.timer);document.removeEventListener('pointermove',pendingMove);document.removeEventListener('pointerup',pendingUp);document.removeEventListener('pointercancel',pendingCancel)};
    const activate=()=>{if(drop!==start)return;start.active=true;const orb=$('#droporb');orb.style.left=start.x+'px';orb.style.top=start.y+'px';orb.style.background=c;orb.classList.add('show');paper.classList.toggle('drop-ready',inside(start.x,start.y));navigator.vibrate?.(18)};
    const pendingMove=ev=>{if(ev.pointerId!==start.id)return;const dx=ev.clientX-start.x,dy=ev.clientY-start.y;if(!start.active&&Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)){cleanup();drop=null;return}if(start.active){ev.preventDefault();colorMove(ev)}};
    const finish=ev=>{if(ev.pointerId!==start.id)return;cleanup();if(start.active)colorEnd(ev);else{choose(c,b);drop=null}};
    const pendingUp=ev=>finish(ev),pendingCancel=()=>{cleanup();$('#droporb').classList.remove('show');paper.classList.remove('drop-ready');drop=null};
    start.timer=setTimeout(activate,220);document.addEventListener('pointermove',pendingMove,{passive:false});document.addEventListener('pointerup',pendingUp);document.addEventListener('pointercancel',pendingCancel)
  }
  function colorMove(e){if(!drop?.active||e.pointerId!==drop.id)return;e.preventDefault();const orb=$('#droporb');orb.style.left=e.clientX+'px';orb.style.top=e.clientY+'px';orb.style.background=drop.c;orb.classList.add('show');paper.classList.toggle('drop-ready',inside(e.clientX,e.clientY))}
  function inside(x,y){const r=canvas.getBoundingClientRect();return x>r.left+10&&x<r.right-10&&y>r.top+10&&y<r.bottom-10}
  function colorEnd(e){$('#droporb').classList.remove('show');paper.classList.remove('drop-ready');if(drop?.active&&inside(e.clientX,e.clientY)){saveState();const p=pos(e.clientX,e.clientY);flood(p.x,p.y,drop.c);setTool('fill')}drop=null}`);

  html=html.replace("function setup(){ctx.lineCap='round';", "function setup(){ctx.globalAlpha=+($('#opacity')?.value||100)/100;ctx.lineCap='round';");
  html=html.replace("function blank(){ctx.globalCompositeOperation='source-over';", "function blank(){ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';");

  html=html.replace("function choose(c,b){color=c;", "function choose(c,b){color=c;$('#activeColor')&&($('#activeColor').style.background=c);");

  html=html.replace("blank();fit();buttons();setTimeout", `
const mainSize=$('#size'),proSize=$('#proSize'),sizeValue=$('#sizeValue'),opacity=$('#opacity'),opacityValue=$('#opacityValue');
function syncSize(v){mainSize.value=v;proSize.value=v;sizeValue.textContent=v}mainSize.addEventListener('input',e=>syncSize(e.target.value));proSize.addEventListener('input',e=>syncSize(e.target.value));opacity.addEventListener('input',e=>opacityValue.textContent=e.target.value+'%');syncSize(mainSize.value);$('#activeColor').style.background=color;
$('#quickBtn').onclick=()=>$('#quickMenu').classList.toggle('show');document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{const a=b.dataset.quick;$('#quickMenu').classList.remove('show');if(a==='fit')fit();if(a==='drawings')$('#presets').click();if(a==='blank')$('#clear').click();if(a==='save')$('#save').click()});
$('#focusToggle').onclick=()=>{document.body.classList.toggle('focus-mode');$('#focusToggle').textContent=document.body.classList.contains('focus-mode')?'✕':'⛶';setTimeout(fit,80)};
function gestureMessage(t){const e=$('#gestureToast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),800)}
let tapGesture={start:0,max:0,moved:false};viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;if(!tapGesture.start)tapGesture={start:performance.now(),max:0,moved:false};tapGesture.max=Math.max(tapGesture.max,pointers.size+1)},{capture:true});viewport.addEventListener('pointermove',()=>{if(tapGesture.start&&performance.now()-tapGesture.start>220)tapGesture.moved=true},{capture:true});viewport.addEventListener('pointerup',()=>{setTimeout(()=>{if(!tapGesture.start||pointers.size)return;const elapsed=performance.now()-tapGesture.start;if(!tapGesture.moved&&elapsed<330&&tapGesture.max===2&&history.length){$('#undo').click();gestureMessage('Undo')}else if(!tapGesture.moved&&elapsed<330&&tapGesture.max>=3&&future.length){$('#redo').click();gestureMessage('Redo')}tapGesture={start:0,max:0,moved:false}},0)},{capture:true});
blank();fit();buttons();setTimeout`);

  return html;
}

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/kids-drawing-app/')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>new Response(enhanceHTML(await r.text()),{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})).catch(()=>caches.match('./index.html').then(async r=>r?new Response(enhanceHTML(await r.text()),{headers:{'Content-Type':'text/html; charset=utf-8'}}):Response.error())));return;
  }
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});