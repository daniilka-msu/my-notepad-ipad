const ObjectTools = (() => {
  const types=new Map();let selection=null,drag=null;
  const button=document.createElement('button');button.id='selectObject';button.className='tool';button.dataset.tool='pageObject';Interface.decorate(button,'move','Выбрать объект');$('textTool').after(button);button.onclick=()=>{Editor.choose('pageObject');$('extraTools').open=false};
  const frame=document.createElement('div');frame.id='objectSelection';frame.hidden=true;frame.innerHTML='<button id="resizeObject" aria-label="Изменить размер объекта"></button>';$('page').append(frame);Interface.decorate($('resizeObject'),'focus','Изменить размер объекта',true);
  const inspector=document.createElement('div');inspector.id='objectInspector';inspector.hidden=true;inspector.innerHTML='<span id="objectName"></span><button id="editObject">Свойства</button><button id="objectFront">На передний план</button><button id="objectBack">На задний план</button><button id="deleteObject">Удалить</button><button id="deselectObject">Снять выделение</button>';$('workspace').append(inspector);
  function current(){if(!selection||selection.book!==book||selection.page!==page||selection.items!==book.pages[page])return null;const s=Shapes.resolve(selection.items)[selection.index];return s&&types.has(s.type)&&!selection.items.some(e=>e.tool==='stroke-eraser'&&e.targets.includes(selection.index))?s:null}
  function clear(){selection=null;drag=null;Shapes.setPreview(null);frame.hidden=true;inspector.hidden=true}
  function update(){const s=current();if(!s){clear();return}const def=types.get(s.type),b=def.bounds(s);Object.assign(frame.style,{left:b.x/W*100+'%',top:b.y/H*100+'%',width:b.width/W*100+'%',height:b.height/H*100+'%'});frame.hidden=false;inspector.hidden=false;$('objectName').textContent=def.label+(s.locked?' · заблокировано':'');$('resizeObject').hidden=!!s.locked;$('deleteObject').disabled=!!s.locked;$('editObject').disabled=!!s.locked;$('objectFront').disabled=!!s.locked;$('objectBack').disabled=!!s.locked}
  function cancel(){if(drag){drag=null;Shapes.setPreview(null);paint()}update()}
  function commit(value){const old=current();if(!old)return;if(old.locked&&value?.locked!==false)return;if(value!==null&&!types.get(old.type).valid(value)){cancel();return}selection.items.push({type:'object-edit',target:selection.index,value});redo=[];Shapes.setPreview(null);drag=null;render()}
  function select(index){Editor.choose('pageObject');selection={book,page,items:book.pages[page],index};update()}
  function add(value){if(!types.get(value.type)?.valid(value))throw new Error('Неверные параметры объекта');finish();book.pages[page].push(value);redo=[];render();select(book.pages[page].length-1)}
  $('editObject').onclick=()=>{const s=current();if(s)types.get(s.type).edit(s,commit)};$('deleteObject').onclick=()=>{commit(null);clear()};$('deselectObject').onclick=clear;
  for(const [id,placement]of [['objectFront','front'],['objectBack','back']])$(id).onclick=()=>{if(!current()||current().locked)return;selection.items.push({type:'object-order',target:selection.index,placement});redo=[];render()};
  function start(e,mode){const s=current();if(!s||s.locked)return;try{canvas.setPointerCapture(e.pointerId)}catch{return}drag={id:e.pointerId,type:e.pointerType,time:e.timeStamp,point:pos(e),original:structuredClone(s),mode};e.preventDefault();e.stopImmediatePropagation()}
  canvas.addEventListener('pointerdown',e=>{
    if(tool!=='pageObject')return;e.preventDefault();e.stopImmediatePropagation();if(drag||e.button>0||!validPosition(e)||($('inputMode').value!=='any'&&e.pointerType!=='pen'))return;
    const p=pos(e),items=book.pages[page],hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));selection=null;
    for(const [index,s]of Shapes.ordered(items,false).reverse()){if(!s||!types.has(s.type)||hidden.has(index))continue;const b=types.get(s.type).bounds(s);if(p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height){selection={book,page,items,index};break}}update();start(e,'move');
  },true);
  $('resizeObject').onpointerdown=e=>{if(!drag&&e.button===0&&validPosition(e)&&($('inputMode').value==='any'||e.pointerType==='pen'))start(e,'resize')};
  function move(e){if(!drag||drag.id!==e.pointerId||drag.type!==e.pointerType||!validPosition(e)||e.timeStamp<drag.time)return;drag.time=e.timeStamp;const p=pos(e),s=drag.original,dx=p.x-drag.point.x,dy=p.y-drag.point.y;
    const def=types.get(s.type),value=drag.mode==='move'?{...s,x:s.x+dx,y:s.y+dy}:def.resize(s,dx,dy);
    Shapes.setPreview({items:selection.items,index:selection.index,value});paint();update();e.preventDefault();e.stopImmediatePropagation();
  }
  canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;move(e);const value=current();if(JSON.stringify(value)!==JSON.stringify(drag.original))commit(value);else cancel();e.preventDefault();e.stopImmediatePropagation()},true);
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag?.id===e.pointerId){cancel();e.stopImmediatePropagation()}},true);
  document.addEventListener('notepad:render',update);document.addEventListener('notepad:gesture-start',cancel);document.addEventListener('notepad:tool',()=>{if(tool!=='pageObject')clear()});window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
  document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||document.body.classList.contains('library-open')||e.target.closest?.('input,textarea,select'))return;if(e.key==='Escape')clear();if((e.key==='Delete'||e.key==='Backspace')&&current()){e.preventDefault();$('deleteObject').click()}});
  return {register(type,definition){types.set(type,definition)},current,clear,commit,add,select};
})();
