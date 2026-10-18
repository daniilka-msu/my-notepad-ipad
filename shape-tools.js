const ShapeTools = (() => {
  const labels={line:'Линия',rect:'Прямоугольник',circle:'Круг',ellipse:'Эллипс',triangle:'Треугольник',diamond:'Ромб',pentagon:'Пятиугольник',hexagon:'Шестиугольник',arrow:'Стрелка',doubleArrow:'Двусторонняя стрелка',curve:'Кривая',dashed:'Пунктирная линия'};
  const select=$('shapeKind');select.replaceChildren();for(const kind of Shapes.kinds){const option=document.createElement('option');option.value=kind;option.textContent=labels[kind];select.append(option)}
  const dialog=document.createElement('dialog');dialog.id='shapeDialog';dialog.setAttribute('aria-labelledby','shapeTitle');dialog.innerHTML='<div class="dialog-header"><h2 id="shapeTitle">Фигуры</h2><button id="closeShapes" aria-label="Закрыть фигуры"></button></div><form id="shapeForm" class="settings-content"><div id="shapeTypeRow"></div><label>Цвет контура<input id="shapeColor" type="color"></label><label>Толщина<input id="shapeWidth" type="range" min="1" max="25"><output id="shapeWidthValue"></output></label><label>Непрозрачность<input id="shapeOpacity" type="range" min="5" max="100"><output id="shapeOpacityValue"></output></label><label class="fill-control"><input id="shapeFillEnabled" type="checkbox"> Заливка замкнутой фигуры<input id="shapeFill" type="color" aria-label="Цвет заливки"></label><p class="hint">Круг строится от начальной точки в квадрате с равными сторонами. Эллипс растягивается независимо по ширине и высоте. Кривая — дуга между двумя точками.</p><button id="applyShape" class="primary">Рисовать фигуру</button></form>';document.body.append(dialog);$('shapeTypeRow').append(select.parentElement);
  Interface.decorate($('closeShapes'),'close','Закрыть фигуры',true);
  const selectButton=document.createElement('button');selectButton.id='selectShape';selectButton.className='tool';selectButton.dataset.tool='selectShape';Interface.decorate(selectButton,'move','Выбрать фигуру');$('drawShape').after(selectButton);selectButton.onclick=()=>{Editor.choose('selectShape');$('extraTools').open=false};
  let selection=null,drag=null,editing=false;
  const frame=document.createElement('div');frame.id='shapeSelection';frame.hidden=true;frame.innerHTML='<button id="resizeShape" aria-label="Изменить размер фигуры"></button>';$('page').append(frame);Interface.decorate($('resizeShape'),'focus','Изменить размер фигуры',true);
  const inspector=document.createElement('div');inspector.id='shapeInspector';inspector.hidden=true;inspector.innerHTML='<span id="selectedShapeName"></span><button id="editShape">Свойства</button><button id="deleteShape">Удалить</button><button id="deselectShape">Снять выделение</button>';$('workspace').append(inspector);
  function values(shape){
    select.value=shape?.shape||preferences.shapeKind||'circle';$('shapeColor').value=shape?.color||preferences.shapeColor||preferences.color;$('shapeWidth').value=shape?.width||preferences.shapeWidth||preferences.width;$('shapeOpacity').value=Math.round((shape?.opacity??(preferences.shapeOpacity??100)/100)*100);$('shapeFillEnabled').checked=!!(shape?shape.fill:preferences.shapeFilled);$('shapeFill').value=shape?.fill||preferences.shapeFill||'#a9b9ff';updateLabels();
  }
  function updateLabels(){$('shapeWidthValue').textContent=$('shapeWidth').value+' px';$('shapeOpacityValue').textContent=$('shapeOpacity').value+'%';$('shapeFill').disabled=!$('shapeFillEnabled').checked||!Shapes.closed.has(select.value)}
  for(const id of ['shapeWidth','shapeOpacity','shapeFillEnabled','shapeKind'])$(id).addEventListener('input',updateLabels);
  function current(){if(!selection||selection.book!==book||selection.page!==page||selection.items!==book.pages[page])return null;const hidden=new Set(selection.items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));return hidden.has(selection.index)?null:Shapes.resolve(selection.items)[selection.index]}
  function update(){const shape=current();if(!shape){clear();return}const b=Shapes.bounds(shape);frame.hidden=false;frame.style.left=b.x/W*100+'%';frame.style.top=b.y/H*100+'%';frame.style.width=Math.max(1,b.right-b.x)/W*100+'%';frame.style.height=Math.max(1,b.bottom-b.y)/H*100+'%';inspector.hidden=false;$('selectedShapeName').textContent=labels[shape.shape]||'Фигура'}
  function cancel(){if(drag){Shapes.setPreview(null);drag=null;paint()}update()}
  function clear(){Shapes.setPreview(null);drag=null;selection=null;frame.hidden=true;inspector.hidden=true}
  function commit(value){if(!selection)return;selection.items.push({type:'shape-edit',target:selection.index,value});redo=[];Shapes.setPreview(null);drag=null;render();update()}
  function open(edit){editing=edit;values(edit?current():null);$('applyShape').textContent=edit?'Применить к фигуре':'Рисовать фигуру';$('shapeTitle').textContent=edit?'Свойства фигуры':'Фигуры';dialog.showModal()}
  $('drawShape').onclick=()=>{finish();$('extraTools').open=false;open(false)};$('closeShapes').onclick=()=>dialog.close();$('editShape').onclick=()=>open(true);$('deleteShape').onclick=()=>{commit(null);clear()};$('deselectShape').onclick=clear;
  $('shapeForm').onsubmit=e=>{
    e.preventDefault();const style={shape:select.value,color:$('shapeColor').value,width:Number($('shapeWidth').value),opacity:Number($('shapeOpacity').value)/100,fill:$('shapeFillEnabled').checked&&Shapes.closed.has(select.value)?$('shapeFill').value:null,shapeVersion:1};
    if(editing&&current()){
      const old=current(),b=Shapes.bounds(old),start=old.shapeStart||{x:b.x,y:b.y},end=old.shapeEnd||{x:b.right,y:b.bottom};commit({...old,...style,shapeStart:start,shapeEnd:end,points:old.shape===style.shape?old.points:Shapes.points(style.shape,start,end,book)});
    }else{preferences.shapeKind=style.shape;preferences.shapeColor=style.color;preferences.shapeWidth=style.width;preferences.shapeOpacity=Number($('shapeOpacity').value);preferences.shapeFilled=!!style.fill;preferences.shapeFill=$('shapeFill').value;Editor.persist();Editor.choose('shape')}
    dialog.close();
  };
  function start(e,mode){const shape=current();if(!shape)return;try{canvas.setPointerCapture(e.pointerId)}catch{return}drag={id:e.pointerId,type:e.pointerType,time:e.timeStamp,mode,point:pos(e),shape:structuredClone(shape)};e.preventDefault();e.stopImmediatePropagation()}
  canvas.addEventListener('pointerdown',e=>{
    if(tool!=='selectShape')return;
    e.preventDefault();e.stopImmediatePropagation();if(drag||!validPosition(e)||e.button>0||($('inputMode').value!=='any'&&e.pointerType!=='pen'))return;
    const items=book.pages[page],hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets)),resolved=Shapes.resolve(items,false),p=pos(e),tolerance=12*W/canvas.getBoundingClientRect().width;
    selection=null;for(let i=resolved.length-1;i>=0;i--)if(resolved[i]?.shape&&!hidden.has(i)&&Shapes.hit(resolved[i],p,tolerance)){selection={book,page,items,index:i};break}update();start(e,'move');
  },true);
  $('resizeShape').onpointerdown=e=>{if(!drag&&e.button===0&&validPosition(e)&&($('inputMode').value==='any'||e.pointerType==='pen'))start(e,'resize')};
  function moved(e){
    if(!drag||e.pointerId!==drag.id||e.pointerType!==drag.type||!validPosition(e)||e.timeStamp<drag.time)return;
    drag.time=e.timeStamp;const p=pos(e),original=drag.shape,b=Shapes.bounds(original),dx=p.x-drag.point.x,dy=p.y-drag.point.y;
    let transform;
    if(drag.mode==='move')transform=q=>({...q,x:q.x+dx,y:q.y+dy});
    else{let sx=Math.max(8,b.right-b.x+dx)/Math.max(1,b.right-b.x),sy=Math.max(8,b.bottom-b.y+dy)/Math.max(1,b.bottom-b.y);if(original.shape==='circle')sx=sy=Math.max(sx,sy);transform=q=>({...q,x:b.x+(q.x-b.x)*sx,y:b.y+(q.y-b.y)*sy})}
    const value={...original,points:original.points.map(transform)};if(value.shapeStart)value.shapeStart=transform(value.shapeStart);if(value.shapeEnd)value.shapeEnd=transform(value.shapeEnd);Shapes.setPreview({items:selection.items,index:selection.index,value});paint();update();e.preventDefault();e.stopImmediatePropagation();
  }
  canvas.addEventListener('pointermove',moved,true);
  canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;moved(e);const value=current(),changed=JSON.stringify(value)!==JSON.stringify(drag.shape);if(changed)commit(value);else cancel();e.preventDefault();e.stopImmediatePropagation()},true);
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag?.id===e.pointerId){cancel();e.stopImmediatePropagation()}},true);
  document.addEventListener('notepad:render',update);document.addEventListener('notepad:gesture-start',cancel);document.addEventListener('notepad:tool',()=>{if(tool!=='selectShape')clear()});window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
  document.addEventListener('keydown',e=>{if(document.body.classList.contains('library-open')||document.querySelector('dialog[open]')||e.target.closest?.('input,textarea,select'))return;if(e.key==='Escape')clear();if((e.key==='Delete'||e.key==='Backspace')&&current()){e.preventDefault();$('deleteShape').click()}});
  values();return {clear,current,cancel,commit};
})();
