const TextTools = (() => {
  const button=document.createElement('button');button.id='textTool';button.className='tool';button.dataset.tool='textBlock';
  Interface.decorate(button,'text','Текст');$('selectShape').after(button);
  const dialog=document.createElement('dialog');dialog.id='textDialog';dialog.setAttribute('aria-labelledby','textTitle');
  dialog.innerHTML='<div class="dialog-header"><h2 id="textTitle">Текст</h2><button id="closeText" aria-label="Закрыть редактор"></button></div><form id="textForm" class="settings-content"><label for="textContent">Содержимое</label><textarea id="textContent" rows="6" maxlength="10000" placeholder="Введите текст"></textarea><div class="text-properties"><label>Шрифт<select id="textFont"></select></label><label>Размер<input id="textSize" type="number" min="8" max="120" value="24" required></label><label>Цвет<input id="textColor" type="color" value="#222222"></label><label>Выравнивание<select id="textAlign"><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label><label><input id="textBold" type="checkbox"> Полужирный</label><label><input id="textItalic" type="checkbox"> Курсив</label><label><input id="textUnderline" type="checkbox"> Подчёркивание</label><label><input id="textBackgroundEnabled" type="checkbox"> Фон<input id="textBackground" type="color" value="#fff5c9" aria-label="Цвет фона текста"></label></div><p class="hint">Нажмите на текст инструментом «Текст», чтобы выбрать его. Перетаскивайте блок; нижний маркер меняет ширину и перенос строк.</p><button id="saveText" class="primary">Сохранить текст</button></form>';
  document.body.append(dialog);Interface.decorate($('closeText'),'close','Закрыть редактор',true);
  for(const name of Object.keys(TextBlocks.fonts)){$('textFont').add(new Option(name,name))}
  const frame=document.createElement('div');frame.id='textSelection';frame.hidden=true;frame.innerHTML='<button id="resizeText" aria-label="Изменить ширину текста"></button>';$('page').append(frame);Interface.decorate($('resizeText'),'focus','Изменить ширину текста',true);
  const inspector=document.createElement('div');inspector.id='textInspector';inspector.hidden=true;inspector.innerHTML='<button id="editText">Редактировать текст</button><button id="deleteText">Удалить текст</button><button id="deselectText">Снять выделение</button>';$('workspace').append(inspector);
  let selection=null,drag=null,draft=null;
  function hit(s,p){const b=window.SceneObjects?SceneObjects.bounds(s):{x:s.x,y:s.y,width:s.width,height:TextBlocks.layout(s).height};return p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height}
  function preview(){const field=$('textContent');field.style.fontFamily=TextBlocks.fonts[$('textFont').value];field.style.fontSize=$('textSize').value+'px';field.style.fontWeight=$('textBold').checked?'bold':'normal';field.style.fontStyle=$('textItalic').checked?'italic':'normal';field.style.textAlign=$('textAlign').value;field.style.color=$('textColor').value;field.style.background=$('textBackgroundEnabled').checked?$('textBackground').value:(paperColors[book.paperColor]||paperColors.white);field.style.textDecoration=$('textUnderline').checked?'underline':'none'}
  for(const id of ['textFont','textSize','textBold','textItalic','textAlign','textColor','textUnderline','textBackgroundEnabled','textBackground'])$(id).addEventListener('input',preview);
  let previewFrame=0;
  function stopPreview(){if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=0}
  function previewPaint(){if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;if(drag){paint();update()}})}
  function current(){if(!selection||selection.book!==book||selection.page!==page||selection.items!==book.pages[page])return null;const erased=selection.items.some(s=>s.tool==='stroke-eraser'&&s.targets.includes(selection.index));const s=Shapes.resolve(selection.items)[selection.index];return !erased&&s?.type==='text-block'?s:null}
  function clear(){stopPreview();selection=null;drag=null;Shapes.setPreview(null);frame.hidden=true;inspector.hidden=true}
  function update(){const s=current();if(!s){clear();return}frame.hidden=false;inspector.hidden=false;const b=window.SceneObjects?SceneObjects.bounds(s):{x:s.x,y:s.y,width:s.width,height:TextBlocks.layout(s).height};$('deleteText').disabled=$('editText').disabled=!!s.locked;$('resizeText').hidden=!!s.locked;Object.assign(frame.style,{left:b.x/W*100+'%',top:b.y/H*100+'%',width:b.width/W*100+'%',height:b.height/H*100+'%'})}
  function cancel(){stopPreview();if(drag){drag=null;Shapes.setPreview(null);paint()}update()}
  function commit(value){stopPreview();if(current()?.locked&&value?.locked!==false)return;selection.items.push({type:'text-edit',target:selection.index,value});redo=[];Shapes.setPreview(null);drag=null;render()}
  function open(s,point){draft={book,page,items:book.pages[page],index:s?selection.index:null,point};$('textContent').value=s?.text||'';$('textFont').value=s?.font||'Arial';$('textSize').value=s?.size||24;$('textColor').value=s?.color||preferences.color;$('textAlign').value=s?.align||'left';$('textBold').checked=!!s?.bold;$('textItalic').checked=!!s?.italic;$('textUnderline').checked=!!s?.underline;$('textBackgroundEnabled').checked=!!s?.background;$('textBackground').value=s?.background||'#fff5c9';preview();dialog.showModal();$('textContent').focus()}
  button.onclick=()=>{finish();Editor.choose('textBlock');$('extraTools').open=false};
  $('closeText').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{draft=null});
  $('editText').onclick=()=>{if(current())open(current())};$('deleteText').onclick=()=>{if(current())commit(null);clear()};$('deselectText').onclick=clear;
  $('textForm').onsubmit=e=>{
    e.preventDefault();if(!draft||draft.book!==book||draft.page!==page||draft.items!==book.pages[page]){dialog.close();return}
    const old=draft.index===null?null:current();if(draft.index!==null&&!old){dialog.close();return}
    const s={...old,type:'text-block',x:old?.x??draft.point.x,y:old?.y??draft.point.y,width:old?.width??Math.max(40,Math.min(320,W-draft.point.x)),text:$('textContent').value,font:$('textFont').value,size:Number($('textSize').value),color:$('textColor').value,align:$('textAlign').value,bold:$('textBold').checked,italic:$('textItalic').checked,underline:$('textUnderline').checked,background:$('textBackgroundEnabled').checked?$('textBackground').value:null};
    if(!TextBlocks.valid(s)||!s.text.trim()){$('textContent').focus();return}
    if(old)commit(s);else{const items=book.pages[page];items.push(s);selection={book,page,items,index:items.length-1};redo=[];render()}
    dialog.close();update();if(!old)document.dispatchEvent(new Event("notepad:text-added"));
  };
  function start(e,mode){const s=current();if(!s||s.locked)return;try{canvas.setPointerCapture(e.pointerId)}catch{return}drag={id:e.pointerId,type:e.pointerType,time:e.timeStamp,point:pos(e),original:structuredClone(s),mode};e.preventDefault();e.stopImmediatePropagation()}
  canvas.addEventListener('pointerdown',e=>{
    if(tool!=='textBlock')return;e.preventDefault();e.stopImmediatePropagation();
    if(drag||!validPosition(e)||e.button>0||($('inputMode').value!=='any'&&e.pointerType!=='pen'))return;
    const p=pos(e),items=book.pages[page],resolved=Shapes.resolve(items,false),hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));selection=null;
    for(let i=resolved.length-1;i>=0;i--){const s=resolved[i];if(s?.type==='text-block'&&!hidden.has(i)&&hit(s,p)){selection={book,page,items,index:i};break}}
    update();if(selection)start(e,'move');else pending={id:e.pointerId,type:e.pointerType,point:p,clientX:e.clientX,clientY:e.clientY};
  },true);
  let pending=null;
  $('resizeText').onpointerdown=e=>{if(!drag&&e.button===0&&validPosition(e)&&($('inputMode').value==='any'||e.pointerType==='pen'))start(e,'resize')};
  function move(e){
    if(!drag||e.pointerId!==drag.id||e.pointerType!==drag.type||!validPosition(e)||e.timeStamp<drag.time)return;
    drag.time=e.timeStamp;const p=pos(e),s=drag.original,dx=p.x-drag.point.x,dy=p.y-drag.point.y;
    const angle=(s.rotation||0)*Math.PI/180,localDx=dx*Math.cos(angle)+dy*Paper.geometry(book).outputHeight/H*Math.sin(angle);
    const bounds=window.SceneObjects?SceneObjects.bounds(s):{x:s.x,y:s.y,width:s.width,height:TextBlocks.layout(s).height};
    let moveX=dx,moveY=dy;
    const format=book.canvasDocument?.format;
    if(!format||format==='continuous'){
      if(bounds.width<=W)moveX=Math.max(-bounds.x,Math.min(W-bounds.x-bounds.width,dx));
      const top=format==='continuous'?-(book.canvasCamera?.y||0):0;
      moveY=Math.max(top-bounds.y,dy);
      if(!format&&bounds.height<=H)moveY=Math.min(H-bounds.y-bounds.height,moveY);
    }
    const value=drag.mode==='resize'?{...s,width:Math.max(40,Math.min(book.canvasDocument||s.rotation?794:Math.max(40,W-s.x),s.width+localDx))}:{...s,x:s.x+moveX,y:s.y+moveY};
    Shapes.setPreview({items:selection.items,index:selection.index,value});previewPaint();e.preventDefault();e.stopImmediatePropagation();
  }
  canvas.addEventListener('pointermove',e=>{if(pending?.id===e.pointerId&&Math.hypot(e.clientX-pending.clientX,e.clientY-pending.clientY)>12)pending=null;move(e)},true);
  canvas.addEventListener('pointerup',e=>{
    if(pending?.id===e.pointerId){const p=pending;pending=null;if(e.pointerType===p.type&&validPosition(e))open(null,{x:Math.max(0,Math.min(W-40,p.point.x)),y:Math.max(0,Math.min(H-40,p.point.y))});e.preventDefault();e.stopImmediatePropagation();return}
    if(drag?.id!==e.pointerId)return;move(e);const value=current();if(JSON.stringify(value)!==JSON.stringify(drag.original))commit(value);else cancel();e.preventDefault();e.stopImmediatePropagation();
  },true);
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(pending?.id===e.pointerId)pending=null;if(drag?.id===e.pointerId){cancel();e.stopImmediatePropagation()}},true);
  document.addEventListener('notepad:render',update);document.addEventListener('notepad:gesture-start',()=>{pending=null;cancel()});document.addEventListener('notepad:tool',()=>{if(tool!=='textBlock'){pending=null;clear()}});window.addEventListener('blur',()=>{pending=null;cancel()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pending=null;cancel()}});
  document.addEventListener('keydown',e=>{if(document.body.classList.contains('home-view')||document.querySelector('dialog[open]')||document.body.classList.contains('library-open')||e.target.closest?.('input,textarea,select'))return;if(e.key==='Escape')clear();if((e.key==='Delete'||e.key==='Backspace')&&current()){e.preventDefault();$('deleteText').click()}});
  return {current,clear,commit};
})();
