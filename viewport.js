const PageView=(()=>{
  const workspace=$('workspace'),sheet=$('page');
  const stage=document.createElement('div');stage.id='sheetStage';sheet.before(stage);stage.append(sheet);
  const controls=document.createElement('div');controls.id='viewControls';controls.innerHTML='<button class="tool" data-tool="hand" aria-pressed="false">Рука</button><button id="zoomOut" aria-label="Уменьшить масштаб">−</button><output id="zoomValue" aria-live="polite">100%</output><button id="zoomIn" aria-label="Увеличить масштаб">+</button><button id="fitPage">По ширине</button>';
  $('bottom').before(controls);
  let zoom=1,fitted=true,gesture=null;
  const touches=new Map(),blocked=new Set();
  function layout(){
    if(!sheet.isConnected)return;
    const geometry=Paper.geometry(book||{}),ratio=geometry.outputHeight/geometry.outputWidth;
    const width=W*zoom,height=width*ratio;
    stage.style.width=Math.max(workspace.clientWidth,width+48)+'px';stage.style.height=height+48+'px';
    sheet.style.width=width+'px';sheet.style.height=height+'px';$('zoomValue').textContent=Math.round(zoom*100)+'%';
    $('zoomOut').disabled=zoom<=.5;$('zoomIn').disabled=zoom>=3;
  }
  function setZoom(value,x,y){
    const r=sheet.getBoundingClientRect(),wr=workspace.getBoundingClientRect();
    x??=wr.left+workspace.clientWidth/2;y??=wr.top+workspace.clientHeight/2;
    const u=(x-r.left)/r.width,v=(y-r.top)/r.height;
    zoom=Math.min(3,Math.max(.5,value));layout();
    const next=sheet.getBoundingClientRect();workspace.scrollLeft+=next.left+u*next.width-x;workspace.scrollTop+=next.top+v*next.height-y;
  }
  function fit(){fitted=true;setZoom(Math.min(1,(workspace.clientWidth-48)/W));workspace.scrollTop=0}
  function discardInk(){if(drawing){drawing=null;activePointer=null;activeType=null;strokePage=null;lastSample=null;paint()}}
  function center(){const values=[...touches.values()];return {x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2,d:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y)}}
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='pen'&&!gesture)touches.clear();
    if(e.pointerType==='touch')touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(e.pointerType==='touch'&&touches.size>=2&&activeType!=='pen'){
      discardInk();for(const id of touches.keys())blocked.add(id);const c=center();gesture={type:'pinch',...c,zoom};e.preventDefault();e.stopImmediatePropagation();
    }else if(tool==='hand'){
      blocked.add(e.pointerId);gesture={type:'pan',id:e.pointerId,x:e.clientX,y:e.clientY};e.preventDefault();e.stopImmediatePropagation();
    }else if(blocked.size||gesture){blocked.add(e.pointerId);e.stopImmediatePropagation()}
    if(blocked.has(e.pointerId))try{canvas.setPointerCapture(e.pointerId)}catch{}
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!blocked.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();
    if(gesture?.type==='pinch'&&touches.size>=2){const c=center();fitted=false;setZoom(gesture.zoom*c.d/Math.max(1,gesture.d),gesture.x,gesture.y);workspace.scrollLeft-=c.x-gesture.x;workspace.scrollTop-=c.y-gesture.y;gesture={type:'pinch',...c,zoom}}
    else if(gesture?.type==='pan'&&gesture.id===e.pointerId){workspace.scrollLeft-=e.clientX-gesture.x;workspace.scrollTop-=e.clientY-gesture.y;gesture.x=e.clientX;gesture.y=e.clientY}
  },true);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{
    touches.delete(e.pointerId);
    if(!blocked.has(e.pointerId))return;e.preventDefault();e.stopImmediatePropagation();blocked.delete(e.pointerId);gesture=null;
  },true);
  controls.querySelector('[data-tool=hand]').onclick=()=>{finish();tool='hand';document.querySelectorAll('.tool').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool))})};
  $('zoomIn').onclick=()=>{finish();fitted=false;setZoom(zoom+.1)};$('zoomOut').onclick=()=>{finish();fitted=false;setZoom(zoom-.1)};$('fitPage').onclick=()=>{finish();fit()};
  workspace.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();finish();fitted=false;setZoom(zoom*Math.exp(-e.deltaY*.002),e.clientX,e.clientY)}},{passive:false});
  new ResizeObserver((entries,observer)=>{if(!workspace.isConnected){observer.disconnect();return}if(fitted)fit();else layout()}).observe(workspace);
  new MutationObserver(layout).observe(sheet,{attributes:true,attributeFilter:['class']});
  fit();return {setZoom,fit,get zoom(){return zoom},layout};
})();
