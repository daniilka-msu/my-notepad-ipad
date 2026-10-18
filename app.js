const $=id=>document.getElementById(id),KEY='ipad-notebooks-v1';
const uid=()=>crypto.randomUUID?.()||String(Date.now()+Math.random());
let data;try{data=JSON.parse(localStorage.getItem(KEY))}catch{};
if(!data?.books?.length)data={selected:null,books:[{id:uid(),name:'Моя первая тетрадь',paper:'grid',pages:[[]]}]};
let book,page=0,tool='pen',drawing=null,redo=[];
const canvas=$('canvas'),ctx=canvas.getContext('2d'),W=794,H=1123;
canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){alert('Память браузера заполнена. Экспортируйте записи в PDF.')}}
function selected(){book=data.books.find(b=>b.id===data.selected)||data.books[0];data.selected=book.id;page=Math.min(page,book.pages.length-1)}
function renderBooks(){selected();$('books').replaceChildren();for(const b of data.books){const el=document.createElement('button');el.className='book'+(b.id===book.id?' selected':'');el.textContent='📓 '+b.name;el.onclick=()=>{data.selected=b.id;page=0;redo=[];render();$('sidebar').classList.remove('open')};$('books').append(el)}}
function stroke(s){if(s.points.length===0)return;ctx.save();ctx.globalAlpha=s.tool==='marker'?.28:1;ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=s.tool==='eraser'?'#000':s.color;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();const pts=s.points;ctx.moveTo(pts[0].x,pts[0].y);if(pts.length===1){ctx.lineTo(pts[0].x+.01,pts[0].y+.01)}else for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.restore()}
function paint(){ctx.clearRect(0,0,W,H);for(const s of book.pages[page])stroke(s);if(drawing)stroke(drawing)}
function render(){renderBooks();$('bookTitle').textContent=book.name;$('paper').value=book.paper;$('page').className=book.paper;$('pageCount').textContent=`${page+1} / ${book.pages.length}`;$('prev').disabled=page===0;$('next').disabled=page===book.pages.length-1;$('undo').disabled=book.pages[page].length===0;$('redo').disabled=redo.length===0;paint();save()}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
let activePointer=null,activeType=null,frame=null,strokePage=null;
const pencilOnly=document.createElement('label');
pencilOnly.innerHTML='<input id="pencilOnly" type="checkbox"> Только Pencil';
$('toolbar').append(pencilOnly);
function schedulePaint(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;paint()})}
function finish(){
  if(!drawing)return;
  const pointer=activePointer;
  strokePage.push(drawing);drawing=null;activePointer=null;activeType=null;strokePage=null;redo=[];
  if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
  render();
}
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.pointerType==='touch'&&$('pencilOnly').checked)return;
  if(drawing){
    if(e.pointerType!=='pen'||activeType!=='touch')return;
    // A Pencil takes priority over a touch that may have come from a palm.
    const pointer=activePointer;
    drawing=null;activePointer=null;activeType=null;
    if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
  }
  e.preventDefault();activePointer=e.pointerId;activeType=e.pointerType;
  strokePage=book.pages[page];canvas.setPointerCapture(e.pointerId);
  drawing={tool,color:$('color').value,width:Number($('width').value)*(tool==='pen'?1:5),points:[pos(e)]};
  schedulePaint();
});
canvas.addEventListener('pointermove',e=>{
  if(!drawing||e.pointerId!==activePointer)return;
  e.preventDefault();
  const samples=e.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[e])drawing.points.push(pos(sample));
  schedulePaint();
});
canvas.addEventListener('pointerup',e=>{
  if(e.pointerId!==activePointer)return;
  drawing.points.push(pos(e));finish();
});
for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId===activePointer)finish()});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
// Commit before a toolbar action or page change, including keyboard activation.
document.addEventListener('click',e=>{if(!canvas.contains(e.target))finish()},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)finish()});
window.addEventListener('pagehide',finish);
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===b))});
$('undo').onclick=()=>{const s=book.pages[page].pop();if(s)redo.push(s);render()};$('redo').onclick=()=>{const s=redo.pop();if(s)book.pages[page].push(s);render()};
$('clear').onclick=()=>{if(confirm('Очистить текущую страницу?')){book.pages[page]=[];redo=[];render()}};
$('newBook').onclick=()=>{const name=prompt('Название тетради:','Новая тетрадь');if(!name?.trim())return;const b={id:uid(),name:name.trim(),paper:'grid',pages:[[]]};data.books.push(b);data.selected=b.id;page=0;redo=[];render()};
$('addPage').onclick=()=>{book.pages.splice(page+1,0,[]);page++;redo=[];render()};$('prev').onclick=()=>{if(page>0){page--;redo=[];render()}};$('next').onclick=()=>{if(page<book.pages.length-1){page++;redo=[];render()}};$('paper').onchange=e=>{book.paper=e.target.value;render()};$('toggleSidebar').onclick=()=>$('sidebar').classList.toggle('open');
$('exportPdf').onclick=()=>{const old=page;const imgs=[];for(let i=0;i<book.pages.length;i++){page=i;paint();const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;const c=tmp.getContext('2d');c.fillStyle='white';c.fillRect(0,0,W,H);if(book.paper!=='blank'){c.strokeStyle='#dce7f6';c.lineWidth=1;if(book.paper==='grid'){for(let x=0;x<W;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}}for(let y=0;y<H;y+=book.paper==='grid'?24:32){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}}c.drawImage(canvas,0,0,W,H);imgs.push(tmp.toDataURL('image/png'))}page=old;paint();const win=window.open('','_blank');if(!win){alert('Разрешите всплывающие окна для экспорта');return}win.document.write('<html><head><title>Экспорт тетради</title><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:100%;height:100vh;object-fit:contain;break-after:page}</style></head><body>'+imgs.map(s=>`<img src="${s}">`).join('')+'<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>');win.document.close()};
render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
