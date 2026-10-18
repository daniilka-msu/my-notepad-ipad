const $=id=>document.getElementById(id),KEY='ipad-notebooks-v1';
const uid=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());
let data;try{data=JSON.parse(localStorage.getItem(KEY))}catch{};
if(!data?.books?.length)data={selected:null,books:[{id:uid(),name:'Моя первая тетрадь',paper:'grid',gridMm:5,pages:[[]]}]};
let book,page=0,tool='pen',drawing=null,redo=[];
const canvas=$('canvas'),ctx=canvas.getContext('2d'),W=794;
let H=1123;
const paperColors={white:'#ffffff',cream:'#fff6df',gray:'#30343d',black:'#101114'};
let preferences={theme:'system',buttonSize:'normal',toolbarPosition:'top',showSidebar:false,compact:false,penType:'regular',smoothing:20,stabilization:0,opacity:100,color:'#222222',width:3,eraserMode:'pixel'};
try{preferences={...preferences,...JSON.parse(localStorage.getItem('notepad-preferences')||'{}')}}catch{}
if(!Number.isFinite(preferences.stabilization))preferences.stabilization=0;
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
function applyPreferences(){
  document.documentElement.dataset.theme=preferences.theme==='system'?(systemTheme.matches?'dark':'light'):preferences.theme;
  document.body.classList.toggle('large-buttons',preferences.buttonSize==='large');
  document.body.classList.toggle('toolbar-bottom',preferences.toolbarPosition==='bottom');
  document.body.classList.toggle('compact',preferences.compact);
  document.querySelector('meta[name=theme-color]').content=document.documentElement.dataset.theme==='dark'?'#151a27':'#f3f5fa';
}
systemTheme.addEventListener?.('change',applyPreferences);
for(const id of ['theme','buttonSize','toolbarPosition','compact']){
  const control=$(id);if(control.type==='checkbox')control.checked=preferences[id];else control.value=preferences[id];
  control.onchange=()=>{preferences[id]=control.type==='checkbox'?control.checked:control.value;applyPreferences();try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}};
}
$('openSettings').onclick=()=>{$('settingsPaper').value=book.paper;$('settingsColor').value=$('color').value;$('settingsWidth').value=$('width').value;$('paperColor').value=book.paperColor||'white';$('pageSize').value=book.pageSize||'a4';$('gridSize').value=book.gridMm||'legacy';$('gridSize').disabled=book.paper!=='grid';$('settingsDialog').showModal()};
$('closeSettings').onclick=()=>$('settingsDialog').close();
for(const id of ['paperColor','pageSize'])$(id).onchange=()=>{finish();book[id]=$(id).value;render()};
applyPreferences();
const writingControls=document.createElement('div');
writingControls.innerHTML='<label>Цвет пера<input type="color" id="settingsColor" value="#222222"></label><label>Толщина пера<input type="range" id="settingsWidth" min="1" max="25" value="3"></label><label>Ручка<select id="penType"><option value="regular">Обычная</option><option value="ballpoint">Шариковая</option><option value="gel">Гелевая</option><option value="fountain">Перьевая</option></select></label><label>Сглаживание (0 — выключено)<input id="smoothing" type="range" min="0" max="85" value="35"></label><label>Прозрачность (100 — непрозрачно)<input id="opacity" type="range" min="5" max="100" value="100"></label><label>Ластик<select id="eraserMode"><option value="pixel">Стирать участки</option><option value="stroke">Удалять целый штрих</option></select></label><p class="hint">Цвет и толщина также доступны на панели инструментов. Давление учитывается, когда браузер передаёт его для пера; для пальца толщина постоянная.</p>';
$('writingSettings').append(writingControls);
const correctionControls=document.createElement('div');
correctionControls.innerHTML='<label>Обработка почерка<select id="correctionMode"><option value="none">Без коррекции</option><option value="light">Лёгкое сглаживание</option><option value="balanced">Сбалансированное</option><option value="strong">Сильное</option></select></label><label>Стабилизация<input id="stabilization" type="range" min="0" max="60" value="0"></label><p class="hint">Стабилизация уменьшает дрожание, но усиливает отставание линии. Коррекция не предсказывает продолжение штриха.</p><canvas id="linePreview" width="520" height="100" aria-label="Предпросмотр линии"></canvas>';
writingControls.append(correctionControls);
const correctionLevels={none:0,light:20,balanced:45,strong:70};
function updateLinePreview(){
  const preview=$('linePreview'),c=preview.getContext('2d');c.clearRect(0,0,520,100);
  c.strokeStyle=preferences.color;c.lineWidth=preferences.width;c.lineCap='round';c.lineJoin='round';c.beginPath();
  let previous=null;
  for(let x=12;x<508;x+=3){const raw={x,y:50+22*Math.sin(x/32)+3*Math.sin(x*1.7)};const point=filterPoint(raw,previous,preferences.smoothing,preferences.stabilization);if(previous)c.lineTo(point.x,point.y);else c.moveTo(point.x,point.y);previous=point}c.stroke();
}
function syncCorrection(){const value=Number(preferences.smoothing);$('correctionMode').value=value===0?'none':value<=25?'light':value<=55?'balanced':'strong';updateLinePreview()}
$('correctionMode').onchange=()=>{$('smoothing').value=correctionLevels[$('correctionMode').value];$('smoothing').dispatchEvent(new Event('input'))};
$('stabilization').value=preferences.stabilization;
$('stabilization').oninput=()=>{preferences.stabilization=Number($('stabilization').value);try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}updateLinePreview()};
for(const id of ['penType','smoothing','opacity','color','width','eraserMode']){
  $(id).value=preferences[id];
  $(id).oninput=()=>{preferences[id]=['smoothing','opacity','width'].includes(id)?Number($(id).value):$(id).value;try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}syncCorrection()};
}
syncCorrection();
canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
let storageReady=false,storageFailed=false,unsaved=false,saveVersion=0;
function save(){
  if(!storageReady){unsaved=true;return Promise.resolve()}
  const version=++saveVersion;unsaved=true;$('saveStatus').textContent='Сохранение…';
  return NotepadStore.write(data).then(()=>{
    if(version!==saveVersion)return;
    unsaved=false;storageFailed=false;$('saveStatus').textContent='Сохранено на устройстве';if($('saveWarning'))$('saveWarning').hidden=true;
  },()=>{
    unsaved=true;storageFailed=true;$('saveStatus').textContent='Не сохранено — сделайте резервную копию';if($('saveWarning'))$('saveWarning').hidden=false;
    throw new Error('Не удалось сохранить тетрадь. Проверьте свободное место.');
  });
}
function autosave(){save().catch(()=>{})}
function selected(){book=data.books.find(b=>b.id===data.selected)||data.books[0];data.selected=book.id;page=Math.min(page,book.pages.length-1)}
function visibleBooks(){
  const query=($('bookSearch')?.value||'').trim().toLocaleLowerCase('ru');let books=data.books.filter(b=>b.name.toLocaleLowerCase('ru').includes(query));
  const order=$('bookSort')?.value;if(order==='name')books.sort((a,b)=>a.name.localeCompare(b.name,'ru'));if(order==='newest')books.reverse();return books;
}
function renderBooks(){
  selected();$('books').replaceChildren();
  for(const b of visibleBooks()){
    const el=document.createElement('button');el.className='book'+(b.id===book.id?' selected':'');el.setAttribute('aria-current',String(b.id===book.id));
    const cover=document.createElement('span');cover.className='book-cover';cover.append(NotepadIcons.create('notebook'));
    const details=document.createElement('span');details.className='book-details';const name=document.createElement('span');name.className='book-name';name.textContent=b.name;const count=document.createElement('small');count.textContent=b.pages.length+' стр.';details.append(name,count);el.append(cover,details);
    el.onclick=()=>{data.selected=b.id;page=0;redo=[];render();document.dispatchEvent(new Event('notepad:book-selected'))};$('books').append(el);
  }
  if($('libraryCount'))$('libraryCount').textContent=data.books.length;
}
const inkLayer=document.createElement('canvas');inkLayer.width=canvas.width;inkLayer.height=canvas.height;
const ink=inkLayer.getContext('2d');
function stroke(s){
  if(s.type==='text'){ctx.save();ctx.fillStyle=s.color||'#222';ctx.font='18px -apple-system, sans-serif';for(const [i,line] of s.text.split('\n').entries())ctx.fillText(line,36,50+i*26,W-72);ctx.restore();return}
  if(!s.points?.length)return;
  if(s.shapeVersion===1){Shapes.render(ctx,s);return}
  ink.setTransform(2,0,0,2,0,0);ink.clearRect(0,0,W,H);ink.fillStyle=s.tool==='eraser'?'#000':s.color;ink.strokeStyle=ink.fillStyle;ink.lineCap='round';ink.lineJoin='round';
  const pts=s.points;
  const factor=s.penType==='ballpoint'?.8:s.penType==='gel'?1.15:1;
  if((!s.pressure&&s.penType!=='fountain')||s.tool!=='pen'){
    ink.lineWidth=s.width*factor;ink.beginPath();ink.moveTo(pts[0].x,pts[0].y);
    if(pts.length===1){ink.lineTo(pts[0].x+.01,pts[0].y+.01)}
    else if(s.smoothing>0&&!s.filtered){for(let i=1;i<pts.length-1;i++)ink.quadraticCurveTo(pts[i].x,pts[i].y,(pts[i].x+pts[i+1].x)/2,(pts[i].y+pts[i+1].y)/2);ink.lineTo(pts.at(-1).x,pts.at(-1).y)}
    else for(let i=1;i<pts.length;i++)ink.lineTo(pts[i].x,pts[i].y);
    ink.stroke();
  }else{
    // Render opaque interpolated discs first: alpha is applied once, so joins never darken.
    for(let i=0;i<pts.length;i++){
      const a=pts[Math.max(0,i-1)],b=pts[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
      const steps=Math.max(1,Math.ceil(distance/Math.max(.5,s.width*.2)));
      for(let step=0;step<=steps;step++){
        const t=step/steps,p=s.pressure?(a.p??.5)*(1-t)+(b.p??.5)*t:.5;
        const width=s.width*factor*(.35+1.3*p)*(s.penType==='fountain'?(.7+.6*Math.abs(Math.sin(Math.atan2(b.y-a.y,b.x-a.x)))):1);
        ink.beginPath();ink.arc(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,Math.max(.2,width/2),0,Math.PI*2);ink.fill();
      }
    }
  }
  ctx.save();ctx.globalAlpha=(s.opacity??1)*(s.tool==='marker'?.28:1);ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.drawImage(inkLayer,0,0,W,H);ctx.restore();
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function segmentDistance(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,denominator=rx*sy-ry*sx;
  if(denominator){const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/denominator,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/denominator;if(t>=0&&t<=1&&u>=0&&u<=1)return 0}
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function erasedTargets(eraser,items){return Shapes.resolve(items,false).flatMap((item,index)=>{
  if(!item?.points||item.tool==='eraser'||item.tool==='stroke-eraser')return [];
  const hit=eraser.points.some((p,j)=>item.points.some((b,i)=>segmentDistance(eraser.points[Math.max(0,j-1)],p,item.points[Math.max(0,i-1)],b)<(eraser.width+item.width)/2));
  return hit?[index]:[];
})}
const committedLayer=document.createElement('canvas');committedLayer.width=canvas.width;committedLayer.height=canvas.height;
let cachedItems=null,cachedLength=-1,cachedLast=null;
function paint(includePreview=true){
  const items=book.pages[page],previewErasure=drawing?.tool==='stroke-eraser',previewShape=includePreview&&Shapes.hasPreview(items);
  ctx.clearRect(0,0,W,H);
  if(!previewErasure&&!previewShape&&cachedItems===items&&cachedLength===items.length&&cachedLast===items.at(-1)){
    ctx.drawImage(committedLayer,0,0,W,H);
  }else{
    const hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));
    if(previewErasure)for(const index of erasedTargets(drawing,items))hidden.add(index);
    for(const [i,s]of Shapes.resolve(items,includePreview).entries())if(s&&!hidden.has(i)&&s.tool!=='stroke-eraser')stroke(s);
    if(!previewErasure&&!previewShape){const layer=committedLayer.getContext('2d');layer.clearRect(0,0,committedLayer.width,committedLayer.height);layer.drawImage(canvas,0,0);cachedItems=items;cachedLength=items.length;cachedLast=items.at(-1)}
  }
  if(drawing&&drawing.tool!=='stroke-eraser')stroke(drawing);
}
function render(){renderBooks();$('bookTitle').textContent=book.name;$('paper').value=book.paper;$('page').className=book.paper;
  // Keep the original coordinate system: changing page format never rescales old notes.
  Paper.apply($('page'),book,page);$('gridSize').value=book.gridMm||'legacy';$('gridSize').disabled=book.paper!=='grid';
  $('page').style.setProperty('--paper',paperColors[book.paperColor]||paperColors.white);
  $('page').style.setProperty('--rule',['gray','black'].includes(book.paperColor)?'#596273':'#dce7f6');
  $('pageCount').textContent=`${page+1} / ${book.pages.length}`;$('prev').disabled=page===0;$('next').disabled=page===book.pages.length-1;$('undo').disabled=book.pages[page].length===0;$('redo').disabled=redo.length===0;paint();updateBackground();autosave();document.dispatchEvent(new Event('notepad:render'))}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H,p:e.pointerType==='pen'&&e.pressure>0?e.pressure:.5}}
function filterPoint(point,last,smoothing,stabilization){
  if(!last)return {...point};
  const distance=Math.hypot(point.x-last.x,point.y-last.y);
  const strength=Math.min(.85,Math.max(0,smoothing)/100+Math.max(0,stabilization)/200);
  const weight=Math.max(1-strength,Math.min(1,distance/18));
  return {...point,x:last.x+(point.x-last.x)*weight,y:last.y+(point.y-last.y)*weight};
}
function validPosition(e){
  const r=canvas.getBoundingClientRect();
  return Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)&&r.width>0&&r.height>0;
}
let activePointer=null,activeType=null,frame=null,strokePage=null,lastSample=null;
function appendPoint(e,endpoint=false){
  if(!drawing||e.pointerId!==activePointer||e.pointerType!==activeType||!validPosition(e)||!Number.isFinite(e.timeStamp)||e.timeStamp<lastSample.time)return;
  const distance=Math.hypot(e.clientX-lastSample.x,e.clientY-lastSample.y);
  if(distance===0)return;
  const elapsed=Math.min(50,Math.max(0,e.timeStamp-lastSample.time));
  // A release is not a new movement sample: never chase a distant lift-off coordinate.
  if(!drawing.shape&&distance>(endpoint?32:Math.max(160,elapsed*6))){if(!endpoint)finish();return}
  const point=pos(e),last=drawing.points.at(-1);
  if(endpoint)point.p=last.p;
  if(drawing.shape){drawing.shapeEnd={...point};drawing.points=shapePoints(drawing.shape,drawing.shapeStart||drawing.points[0],point);lastSample={x:e.clientX,y:e.clientY,time:e.timeStamp};return}
  drawing.points.push(filterPoint(point,last,drawing.smoothing,drawing.stabilization));
  lastSample={x:e.clientX,y:e.clientY,time:e.timeStamp};
}
const inputModeControl=document.createElement('label');
inputModeControl.innerHTML='Ввод <select id="inputMode"><option value="any">Любой стилус и палец</option><option value="stylus">Только стилус, если устройство позволяет его определить</option><option value="pencil">Apple Pencil</option></select>';
$('toolbar').append(inputModeControl);
$('writingSettings').append(inputModeControl);
try{$('inputMode').value=localStorage.getItem('notepad-input-mode')||'any'}catch{}
$('inputMode').onchange=()=>{finish();try{localStorage.setItem('notepad-input-mode',$('inputMode').value)}catch{}};
const inputHint=document.createElement('p');
inputHint.className='input-hint';
inputHint.textContent='Неоригинальный стилус может определяться как палец — выберите «Любой стилус и палец». Safari не гарантирует распознавание модели стилуса, включая Apple Pencil.';
$('toolbar').after(inputHint);
$('writingSettings').append(inputHint);
let holdTimer=null;
function scheduleHold(){
  clearTimeout(holdTimer);const current=drawing;
  if(!preferences.holdShape||!current||current.tool!=='pen'||current.shape||current.points.length<3)return;
  holdTimer=setTimeout(()=>{if(drawing!==current)return;const first=current.points[0],last=current.points.at(-1);if(Math.hypot(last.x-first.x,last.y-first.y)<25)return;current.shape='line';current.points=shapePoints('line',first,last);current.pressure=false;current.smoothing=0;paint()},650);
}
function schedulePaint(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;paint()})}
function finish(){
  if(!drawing)return;
  const pointer=activePointer;
  clearTimeout(holdTimer);
  if(drawing.tool==='stroke-eraser')drawing.targets=erasedTargets(drawing,strokePage);
  strokePage.push(drawing);drawing=null;activePointer=null;activeType=null;strokePage=null;lastSample=null;redo=[];
  if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
  render();
}
canvas.addEventListener('pointerdown',e=>{
  if(!validPosition(e)||!Number.isFinite(e.timeStamp)||!['touch','pen','mouse'].includes(e.pointerType))return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if($('inputMode').value!=='any'&&e.pointerType!=='pen')return;
  if(drawing){
    if(e.pointerType!=='pen'||activeType!=='touch')return;
    // A Pencil takes priority over a touch that may have come from a palm.
    const pointer=activePointer;
    drawing=null;activePointer=null;activeType=null;
    if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
  }
  e.preventDefault();activePointer=e.pointerId;activeType=e.pointerType;
  strokePage=book.pages[page];lastSample={x:e.clientX,y:e.clientY,time:e.timeStamp};
  try{canvas.setPointerCapture(e.pointerId)}catch{activePointer=null;activeType=null;strokePage=null;lastSample=null;return}
  drawing={filtered:true,stabilization:preferences.stabilization,tool,color:$('color').value,width:Number($('width').value)*(['pen','shape'].includes(tool)?1:5),penType:preferences.penType,smoothing:preferences.smoothing,opacity:preferences.opacity/100,pressure:e.pointerType==='pen'&&'pressure'in e,points:[pos(e)]};
  if(tool==='shape'){drawing.shape=$('shapeKind').value;drawing.shapeVersion=1;drawing.shapeStart={...drawing.points[0]};drawing.shapeEnd={...drawing.points[0]};drawing.fill=$('shapeFillEnabled').checked?$('shapeFill').value:null;drawing.color=$('shapeColor').value;drawing.width=Number($('shapeWidth').value);drawing.opacity=Number($('shapeOpacity').value)/100;drawing.tool='pen';drawing.pressure=false;drawing.smoothing=0}
  if(tool==='eraser'&&preferences.eraserMode==='stroke')drawing.tool='stroke-eraser';
  schedulePaint();
});
canvas.addEventListener('pointermove',e=>{
  if(!drawing||e.pointerId!==activePointer)return;
  e.preventDefault();
  if(e.pointerType!==activeType)return;
  if(e.pointerType==='mouse'&&e.buttons===0){finish();return}
  let samples=[];try{samples=e.getCoalescedEvents?.()||[]}catch{}
  samples=[...samples,e].filter(sample=>sample.pointerId===activePointer&&sample.pointerType===activeType&&Number.isFinite(sample.timeStamp)&&sample.timeStamp<=e.timeStamp).sort((a,b)=>a.timeStamp-b.timeStamp);
  for(const sample of samples){if(!drawing)break;appendPoint(sample)}
  scheduleHold();
  schedulePaint();
});
canvas.addEventListener('pointerup',e=>{
  if(e.pointerId!==activePointer||e.pointerType!==activeType)return;
  appendPoint(e,true);finish();
});
for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId===activePointer)finish()});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
for(const element of [canvas,$('toolbar')])element.addEventListener('selectstart',e=>e.preventDefault());
canvas.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
canvas.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
// Commit before a toolbar action or page change, including keyboard activation.
document.addEventListener('click',e=>{if(!canvas.contains(e.target))finish()},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)finish()});
window.addEventListener('pagehide',finish);
window.addEventListener('blur',finish);
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===b))});
$('undo').onclick=()=>{const s=book.pages[page].pop();if(s)redo.push(s);render()};$('redo').onclick=()=>{const s=redo.pop();if(s)book.pages[page].push(s);render()};
$('clear').onclick=()=>{if(confirm('Очистить текущую страницу?')){book.pages[page].push({tool:'stroke-eraser',color:'#000000',width:1,points:[],targets:book.pages[page].map((_,i)=>i)});redo=[];render()}};
$('newBook').onclick=()=>{const name=prompt('Название тетради:','Новая тетрадь');if(!name?.trim())return;const b={id:uid(),name:name.trim(),paper:'grid',gridMm:5,pages:[[]]};data.books.push(b);data.selected=b.id;page=0;redo=[];render()};
$('addPage').onclick=()=>{book.pages.splice(page+1,0,[]);if(book.backgrounds)book.backgrounds.splice(page+1,0,null);page++;redo=[];render()};$('prev').onclick=()=>{if(page>0){page--;redo=[];render()}};$('next').onclick=()=>{if(page<book.pages.length-1){page++;redo=[];render()}};$('paper').onchange=e=>{book.paper=e.target.value;render()};


let backgroundToken=0,backgroundURL=null,backgroundId=null;
function insertTextPages(text){
  finish();const lines=[];
  for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if((line+' '+word).length>68){lines.push(line);line=word}else line+=(line?' ':'')+word}lines.push(line)}
  const first=book.pages.length;
  for(let start=0;start<lines.length;start+=38){book.pages.push([{type:'text',text:lines.slice(start,start+38).join('\n'),color:$('color').value}]);if(book.backgrounds)book.backgrounds.push(null)}
  page=first;redo=[];render();
}
async function updateBackground(){
  const background=book.backgrounds?.[page],element=$('pageBackground');
  if(backgroundId===(background?.id||null))return;
  backgroundId=background?.id||null;
  const token=++backgroundToken;
  element.hidden=true;if(backgroundURL){URL.revokeObjectURL(backgroundURL);backgroundURL=null}
  if(!background)return;
  try{const value=await NotepadStore.asset(background.id);if(token!==backgroundToken)return;if(!value)throw new Error('Нет фона');backgroundURL=URL.createObjectURL(value);element.src=backgroundURL;element.hidden=false}catch{if(token===backgroundToken){backgroundId=null;$('saveStatus').textContent='Не удалось загрузить фон документа'}}
}
$('importFile').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  if(!storageReady){alert('Хранилище не готово. Импорт недоступен.');return}
  finish();const dialog=document.createElement('dialog'),progress=document.createElement('p'),cancel=document.createElement('button');let cancelled=false;progress.textContent='Импорт документа…';cancel.textContent='Отмена';cancel.onclick=()=>{cancelled=true;progress.textContent='Отмена импорта…'};dialog.append(progress,cancel);document.body.append(dialog);dialog.showModal();dialog.oncancel=e=>{e.preventDefault();cancel.click()};
  try{
    const imported=[];for(const [i,file]of files.entries()){
      if(file.size>250*1024*1024)throw new Error('Файл превышает 250 МБ: '+file.name);
      const result=await Documents.importFile(file,message=>{if(cancelled)throw new Error('Импорт отменён');progress.textContent=(i+1)+' / '+files.length+' · '+file.name+' · '+message});imported.push(result);if(cancelled)throw new Error('Импорт отменён');
    }

    // Commit the new library only after every background has been stored.
    const next={...data,books:[...data.books,...imported.map(item=>item.book)],selected:imported.at(-1).book.id};await NotepadStore.write(next,imported.flatMap(item=>item.assets));data=next;page=0;redo=[];render();
  }catch(error){alert('Импорт не выполнен: '+error.message)}finally{dialog.close();dialog.remove()}
};
$('exportPdf').onclick=async()=>{
  finish();const notebook=book;
  const win=window.open('','_blank');if(!win){alert('Разрешите всплывающие окна для экспорта PDF');return}
  win.document.title='Экспорт тетради';win.document.body.textContent='Подготовка страниц…';
  try{
    const style=win.document.createElement('style');const size=notebook.pageSize==='a5'?'A5':notebook.pageSize==='square'?'210mm 210mm':'A4';style.textContent=`@page{size:${size};margin:0}body{margin:0;background:white}img{display:block;width:100%;height:100vh;object-fit:contain;break-after:page}img:last-child{break-after:auto}`;win.document.head.append(style);
    const images=[];for(let i=0;i<notebook.pages.length;i++){const target=await Documents.compose(notebook,i);const img=win.document.createElement('img');img.src=target.toDataURL('image/png');images.push(img)}
    win.document.body.replaceChildren(...images);await Promise.all(images.map(img=>img.decode()));win.focus();win.print();
  }catch(error){if(!win.closed)win.document.body.textContent='Ошибка экспорта: '+error.message}
};
const ready=(async()=>{
  $('app').inert=true;
  try{
    await NotepadStore.open();const stored=await NotepadStore.read();
    if(stored?.books?.length)data=Backups.validateLibrary(stored);
    else await NotepadStore.write(Backups.validateLibrary(data));
    storageReady=true;
  }catch{storageFailed=true;$('saveStatus').textContent='Хранилище недоступно — экспортируйте записи';}
  render();if(!storageReady){$('saveStatus').textContent='Хранилище недоступно — записи не сохраняются';if($('saveWarning'))$('saveWarning').hidden=false}$('app').inert=false;
})();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
async function storageInformation(){
  try{
    if(!navigator.storage?.estimate){$('storageInfo').textContent='Браузер не сообщает объём хранилища';return}
    const estimate=await navigator.storage.estimate(),persisted=await navigator.storage.persisted?.();
    const mb=bytes=>(Number(bytes||0)/1024/1024).toFixed(1);
    $('storageInfo').textContent=`Используется ${mb(estimate.usage)} МБ из ${mb(estimate.quota)} МБ (включая кэш). ${persisted?'Долговременное хранение разрешено.':'Храните резервные копии в Файлах: браузер может освобождать место.'}`;
  }catch{$('storageInfo').textContent='Не удалось получить сведения о хранилище'}
  $('requestPersistence').hidden=!navigator.storage?.persist;
}
$('openSettings').addEventListener('click',storageInformation);
$('requestPersistence').onclick=async()=>{try{const granted=await navigator.storage.persist();if(!granted)alert('Браузер не предоставил долговременное хранение. Экспортируйте резервные копии.');await storageInformation()}catch{alert('Долговременное хранение недоступно')}};
$('exportBackup').onclick=async()=>{
  finish();const button=$('exportBackup');button.disabled=true;
  try{
    const value=await Backups.create(data,preferences),blob=new Blob([JSON.stringify(value)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='my-notepad-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){alert('Не удалось создать полную копию: '+error.message)}finally{button.disabled=false}
};
$('importBackup').onclick=()=>$('backupInput').click();
$('backupInput').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(!storageReady){alert('Хранилище недоступно. Восстановление остановлено.');return}
  finish();const button=$('importBackup');button.disabled=true;
  const busy=document.createElement('dialog');busy.textContent='Проверка резервной копии…';document.body.append(busy);busy.showModal();busy.oncancel=e=>e.preventDefault();
  try{
    if(file.size>250*1024*1024)throw new Error('Размер копии превышает 250 МБ');
    const backup=await Backups.parse(await file.text());
    data=await Backups.merge(data,backup);page=0;redo=[];render();await storageInformation();
  }catch(error){alert('Копия не импортирована: '+error.message)}finally{button.disabled=false;busy.close();busy.remove()}
};
for(const [source,target]of [['settingsColor','color'],['settingsWidth','width']])$(source).oninput=()=>{$(target).value=$(source).value;$(target).dispatchEvent(new Event('input'))};
$('settingsPaper').onchange=()=>{book.paper=$('settingsPaper').value;render()};

$('gridSize').onchange=()=>{finish();if($('gridSize').value==='legacy')delete book.gridMm;else book.gridMm=Number($('gridSize').value);render()};
