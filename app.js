const $=id=>document.getElementById(id),KEY='ipad-notebooks-v1';
const uid=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());
let data;try{data=JSON.parse(localStorage.getItem(KEY))}catch{};
if(!data?.books?.length)data={selected:null,books:[{id:uid(),name:'Моя первая тетрадь',paper:'grid',pages:[[]]}]};
let book,page=0,tool='pen',drawing=null,redo=[];
const canvas=$('canvas'),ctx=canvas.getContext('2d'),W=794;
let H=1123;
const paperColors={white:'#ffffff',cream:'#fff6df',gray:'#30343d',black:'#101114'};
let preferences={theme:'system',buttonSize:'normal',toolbarPosition:'top',showSidebar:true,compact:false,penType:'regular',smoothing:35,opacity:100,color:'#222222',width:3,eraserMode:'pixel'};
try{preferences={...preferences,...JSON.parse(localStorage.getItem('notepad-preferences')||'{}')}}catch{}
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
function applyPreferences(){
  document.documentElement.dataset.theme=preferences.theme==='system'?(systemTheme.matches?'dark':'light'):preferences.theme;
  document.body.classList.toggle('large-buttons',preferences.buttonSize==='large');
  document.body.classList.toggle('toolbar-bottom',preferences.toolbarPosition==='bottom');
  document.body.classList.toggle('sidebar-hidden',!preferences.showSidebar);
  document.body.classList.toggle('compact',preferences.compact);
  document.querySelector('meta[name=theme-color]').content=document.documentElement.dataset.theme==='dark'?'#111620':'#edf0f6';
}
systemTheme.addEventListener?.('change',applyPreferences);
for(const id of ['theme','buttonSize','toolbarPosition','showSidebar','compact']){
  const control=$(id);if(control.type==='checkbox')control.checked=preferences[id];else control.value=preferences[id];
  control.onchange=()=>{preferences[id]=control.type==='checkbox'?control.checked:control.value;applyPreferences();try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}};
}
$('openSettings').onclick=()=>{$('paperColor').value=book.paperColor||'white';$('pageSize').value=book.pageSize||'a4';$('settingsDialog').showModal()};
$('closeSettings').onclick=()=>$('settingsDialog').close();
for(const id of ['paperColor','pageSize'])$(id).onchange=()=>{finish();book[id]=$(id).value;render()};
applyPreferences();
const writingControls=document.createElement('div');
writingControls.innerHTML='<label>Ручка<select id="penType"><option value="regular">Обычная</option><option value="ballpoint">Шариковая</option><option value="gel">Гелевая</option><option value="fountain">Перьевая</option></select></label><label>Сглаживание (0 — выключено)<input id="smoothing" type="range" min="0" max="85" value="35"></label><label>Прозрачность (100 — непрозрачно)<input id="opacity" type="range" min="5" max="100" value="100"></label><label>Ластик<select id="eraserMode"><option value="pixel">Стирать участки</option><option value="stroke">Удалять целый штрих</option></select></label><p class="hint">Цвет и толщина — на панели инструментов. Давление учитывается, когда браузер передаёт его для пера; для пальца толщина постоянная.</p>';
$('writingSettings').append(writingControls);
for(const id of ['penType','smoothing','opacity','color','width','eraserMode']){
  $(id).value=preferences[id];
  $(id).oninput=()=>{preferences[id]=['smoothing','opacity','width'].includes(id)?Number($(id).value):$(id).value;try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}};
}
canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
let storageReady=false,storageFailed=false;
function save(){
  if(!storageReady)return Promise.resolve();
  $('saveStatus').textContent='Сохранение…';
  return NotepadStore.write(data).then(()=>{$('saveStatus').textContent='Сохранено на устройстве'},()=>{storageFailed=true;$('saveStatus').textContent='Не сохранено — сделайте резервную копию';return Promise.reject(new Error('Не удалось сохранить тетрадь. Проверьте свободное место.'))});
}
function autosave(){save().catch(()=>{})}
function selected(){book=data.books.find(b=>b.id===data.selected)||data.books[0];data.selected=book.id;page=Math.min(page,book.pages.length-1)}
function renderBooks(){selected();$('books').replaceChildren();for(const b of data.books){const el=document.createElement('button');el.className='book'+(b.id===book.id?' selected':'');el.textContent='📓 '+b.name;el.onclick=()=>{data.selected=b.id;page=0;redo=[];render();$('sidebar').classList.remove('open')};$('books').append(el)}}
const inkLayer=document.createElement('canvas');inkLayer.width=canvas.width;inkLayer.height=canvas.height;
const ink=inkLayer.getContext('2d');
function stroke(s){
  if(!s.points?.length)return;
  if(s.type==='text'){ctx.save();ctx.fillStyle=s.color||'#222';ctx.font='18px -apple-system, sans-serif';for(const [i,line] of s.text.split('\n').entries())ctx.fillText(line,36,50+i*26,W-72);ctx.restore();return}
  ink.setTransform(2,0,0,2,0,0);ink.clearRect(0,0,W,H);ink.fillStyle=s.tool==='eraser'?'#000':s.color;ink.strokeStyle=ink.fillStyle;ink.lineCap='round';ink.lineJoin='round';
  const pts=s.points;
  const factor=s.penType==='ballpoint'?.8:s.penType==='gel'?1.15:1;
  if(!s.pressure||s.tool!=='pen'){
    ink.lineWidth=s.width*factor;ink.beginPath();ink.moveTo(pts[0].x,pts[0].y);
    if(pts.length===1){ink.lineTo(pts[0].x+.01,pts[0].y+.01)}
    else if(s.smoothing>0){for(let i=1;i<pts.length-1;i++)ink.quadraticCurveTo(pts[i].x,pts[i].y,(pts[i].x+pts[i+1].x)/2,(pts[i].y+pts[i+1].y)/2);ink.lineTo(pts.at(-1).x,pts.at(-1).y)}
    else for(let i=1;i<pts.length;i++)ink.lineTo(pts[i].x,pts[i].y);
    ink.stroke();
  }else{
    // Render opaque interpolated discs first: alpha is applied once, so joins never darken.
    for(let i=0;i<pts.length;i++){
      const a=pts[Math.max(0,i-1)],b=pts[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
      const steps=Math.max(1,Math.ceil(distance/Math.max(.5,s.width*.2)));
      for(let step=0;step<=steps;step++){
        const t=step/steps,p=(a.p??.5)*(1-t)+(b.p??.5)*t;
        const width=s.width*factor*(.35+1.3*p)*(s.penType==='fountain'?(.7+.6*Math.abs(Math.sin(Math.atan2(b.y-a.y,b.x-a.x)))):1);
        ink.beginPath();ink.arc(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,Math.max(.2,width/2),0,Math.PI*2);ink.fill();
      }
    }
  }
  ctx.save();ctx.globalAlpha=(s.opacity??1)*(s.tool==='marker'?.28:1);ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.drawImage(inkLayer,0,0,W,H);ctx.restore();
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function erasedTargets(eraser,items){return items.flatMap((item,index)=>{
  if(!item.points||item.tool==='eraser'||item.tool==='stroke-eraser')return [];
  const hit=eraser.points.some(p=>item.points.some((b,i)=>pointSegmentDistance(p,item.points[Math.max(0,i-1)],b)<(eraser.width+item.width)/2));
  return hit?[index]:[];
})}
function paint(){ctx.clearRect(0,0,W,H);const items=book.pages[page],hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));if(drawing?.tool==='stroke-eraser')for(const index of erasedTargets(drawing,items))hidden.add(index);for(const [i,s] of items.entries())if(!hidden.has(i)&&s.tool!=='stroke-eraser')stroke(s);if(drawing&&drawing.tool!=='stroke-eraser')stroke(drawing)}
function render(){renderBooks();$('bookTitle').textContent=book.name;$('paper').value=book.paper;$('page').className=book.paper;
  // Keep the original coordinate system: changing page format never rescales old notes.
  $('page').style.aspectRatio=book.pageSize==='square'?'1':book.pageSize==='a5'?'559 / 794':'794 / 1123';
  $('page').style.setProperty('--paper',paperColors[book.paperColor]||paperColors.white);
  $('page').style.setProperty('--rule',['gray','black'].includes(book.paperColor)?'#596273':'#dce7f6');
  $('pageCount').textContent=`${page+1} / ${book.pages.length}`;$('prev').disabled=page===0;$('next').disabled=page===book.pages.length-1;$('undo').disabled=book.pages[page].length===0;$('redo').disabled=redo.length===0;paint();updateBackground();autosave()}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H,p:e.pointerType==='pen'&&e.pressure>0?e.pressure:.5}}
function appendPoint(e,endpoint=false){
  const point=pos(e),last=drawing.points.at(-1);
  if(!endpoint&&drawing.smoothing>0){const distance=Math.hypot(point.x-last.x,point.y-last.y);const weight=Math.max(1-drawing.smoothing/100,Math.min(1,distance/18));point.x=last.x+(point.x-last.x)*weight;point.y=last.y+(point.y-last.y)*weight;point.p=(last.p??.5)*.3+point.p*.7}
  drawing.points.push(point);
}
let activePointer=null,activeType=null,frame=null,strokePage=null;
const inputModeControl=document.createElement('label');
inputModeControl.innerHTML='Ввод <select id="inputMode"><option value="any">Любой стилус и палец</option><option value="stylus">Только определяемый стилус</option><option value="pencil">Apple Pencil</option></select>';
$('toolbar').append(inputModeControl);
$('writingSettings').append(inputModeControl);
try{$('inputMode').value=localStorage.getItem('notepad-input-mode')||'any'}catch{}
$('inputMode').onchange=()=>{finish();try{localStorage.setItem('notepad-input-mode',$('inputMode').value)}catch{}};
const inputHint=document.createElement('p');
inputHint.className='input-hint';
inputHint.textContent='Неоригинальный стилус может определяться как палец — выберите «Любой стилус и палец». Safari не гарантирует распознавание модели стилуса, включая Apple Pencil.';
$('toolbar').after(inputHint);
$('writingSettings').append(inputHint);
function schedulePaint(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;paint()})}
function finish(){
  if(!drawing)return;
  const pointer=activePointer;
  if(drawing.tool==='stroke-eraser')drawing.targets=erasedTargets(drawing,strokePage);
  strokePage.push(drawing);drawing=null;activePointer=null;activeType=null;strokePage=null;redo=[];
  if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
  render();
}
canvas.addEventListener('pointerdown',e=>{
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
  strokePage=book.pages[page];canvas.setPointerCapture(e.pointerId);
  drawing={tool,color:$('color').value,width:Number($('width').value)*(tool==='pen'?1:5),penType:preferences.penType,smoothing:preferences.smoothing,opacity:preferences.opacity/100,pressure:e.pointerType==='pen'&&'pressure'in e,points:[pos(e)]};
  if(tool==='eraser'&&preferences.eraserMode==='stroke')drawing.tool='stroke-eraser';
  schedulePaint();
});
canvas.addEventListener('pointermove',e=>{
  if(!drawing||e.pointerId!==activePointer)return;
  e.preventDefault();
  const samples=e.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[e])appendPoint(sample);
  schedulePaint();
});
canvas.addEventListener('pointerup',e=>{
  if(e.pointerId!==activePointer)return;
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
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===b))});
$('undo').onclick=()=>{const s=book.pages[page].pop();if(s)redo.push(s);render()};$('redo').onclick=()=>{const s=redo.pop();if(s)book.pages[page].push(s);render()};
$('clear').onclick=()=>{if(confirm('Очистить текущую страницу?')){book.pages[page]=[];redo=[];render()}};
$('newBook').onclick=()=>{const name=prompt('Название тетради:','Новая тетрадь');if(!name?.trim())return;const b={id:uid(),name:name.trim(),paper:'grid',pages:[[]]};data.books.push(b);data.selected=b.id;page=0;redo=[];render()};
$('addPage').onclick=()=>{book.pages.splice(page+1,0,[]);if(book.backgrounds)book.backgrounds.splice(page+1,0,null);page++;redo=[];render()};$('prev').onclick=()=>{if(page>0){page--;redo=[];render()}};$('next').onclick=()=>{if(page<book.pages.length-1){page++;redo=[];render()}};$('paper').onchange=e=>{book.paper=e.target.value;render()};$('toggleSidebar').onclick=()=>{if(!preferences.showSidebar){preferences.showSidebar=true;$('showSidebar').checked=true;applyPreferences()}$('sidebar').classList.toggle('open')};


let backgroundToken=0,backgroundURL=null;
async function updateBackground(){
  const token=++backgroundToken,background=book.backgrounds?.[page],element=$('pageBackground');
  element.hidden=true;if(backgroundURL){URL.revokeObjectURL(backgroundURL);backgroundURL=null}
  if(!background)return;
  try{const value=await NotepadStore.asset(background.id);if(token!==backgroundToken)return;if(!value)throw new Error('Нет фона');backgroundURL=URL.createObjectURL(value);element.src=backgroundURL;element.hidden=false}catch{if(token===backgroundToken)$('saveStatus').textContent='Не удалось загрузить фон документа'}
}
$('importFile').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(!storageReady){alert('Хранилище не готово. Импорт недоступен.');return}
  finish();const dialog=document.createElement('dialog');dialog.textContent='Импорт документа…';document.body.append(dialog);dialog.showModal();dialog.oncancel=e=>e.preventDefault();
  try{
    const result=await Documents.importFile(file,message=>dialog.textContent=message);
    await NotepadStore.putAssets(result.assets);
    // Commit the new library only after every background has been stored.
    const next={...data,books:[...data.books,result.book],selected:result.book.id};await NotepadStore.write(next);data=next;page=0;redo=[];render();
  }catch(error){alert('Импорт не выполнен: '+error.message)}finally{dialog.close();dialog.remove()}
};
$('exportPdf').onclick=async()=>{
  finish();const notebook=book;
  const win=window.open('','_blank');if(!win){alert('Разрешите всплывающие окна для экспорта PDF');return}
  win.document.title='Экспорт тетради';win.document.body.textContent='Подготовка страниц…';
  try{
    const style=win.document.createElement('style');style.textContent='@page{size:A4;margin:0}body{margin:0;background:white}img{display:block;width:100%;height:100vh;object-fit:contain;break-after:page}img:last-child{break-after:auto}';win.document.head.append(style);
    const images=[];for(let i=0;i<notebook.pages.length;i++){const target=await Documents.compose(notebook,i);const img=win.document.createElement('img');img.src=target.toDataURL('image/png');images.push(img)}
    win.document.body.replaceChildren(...images);await Promise.all(images.map(img=>img.decode()));win.focus();win.print();
  }catch(error){if(!win.closed)win.document.body.textContent='Ошибка экспорта: '+error.message}
};
const ready=(async()=>{
  document.querySelector('main').inert=true;
  try{
    await NotepadStore.open();const stored=await NotepadStore.read();
    if(stored?.books?.length)data=stored;
    else await NotepadStore.write(data);
    storageReady=true;
  }catch{storageFailed=true;$('saveStatus').textContent='Хранилище недоступно — экспортируйте записи';}
  render();if(!storageReady)$('saveStatus').textContent='Хранилище недоступно — записи не сохраняются';document.querySelector('main').inert=false;
})();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
