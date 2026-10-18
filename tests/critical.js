(async()=>{
const results=[];
function check(name,condition){results.push((condition?'PASS ':'FAIL ')+name)}
function pointer(type,id,x=100,y=100,pointerType='touch',extra={}){canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType,clientX:x,clientY:y,bubbles:true,cancelable:true,...extra}))}
canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
try{await ready;
check('legacy localStorage migrated',data.books[0].id==='legacy'&&storageReady);
check('legacy source retained',JSON.parse(localStorage.getItem(KEY)).books[0].name==='Старый конспект');
preferences.theme='dark';applyPreferences();check('dark theme',document.documentElement.dataset.theme==='dark');preferences.theme='system';applyPreferences();check('system theme',document.documentElement.dataset.theme===(systemTheme.matches?'dark':'light'));book.paperColor='cream';render();check('paper independent of theme',$('page').style.getPropertyValue('--paper')===paperColors.cream);
const zoomNotes=JSON.stringify(book.pages);PageView.setZoom(3);check('zoom upper limit',PageView.zoom===3);PageView.setZoom(.1);check('zoom lower limit',PageView.zoom===.5);PageView.setZoom(2);
const rect=canvas.getBoundingClientRect(),mapped=pos({clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});check('zoom keeps logical coordinates',Math.abs(mapped.x-W/2)<.01&&Math.abs(mapped.y-H/2)<.01);check('zoom preserves note data',JSON.stringify(book.pages)===zoomNotes);PageView.fit();
const gestureCount=book.pages[page].length;
pointer('pointerdown',501,200,200);pointer('pointerdown',502,260,200);pointer('pointermove',502,300,200);pointer('pointerup',501,200,200);pointer('pointerup',502,300,200);
check('pinch zooms without committing ink',PageView.zoom>.5&&book.pages[page].length===gestureCount&&drawing===null);
$('inputMode').value='pencil';const penModeZoom=PageView.zoom;pointer('pointerdown',503,200,200);pointer('pointerdown',504,260,200);pointer('pointermove',504,300,200);pointer('pointerup',503,200,200);pointer('pointerup',504,300,200);check('pinch works in Pencil mode',PageView.zoom>penModeZoom);$('inputMode').value='any';PageView.fit();
const initial=book.pages[page].length;
preferences.smoothing=70;pointer('pointerdown',99,100,100);pointer('pointermove',99,105,105);check('jitter stabilization',drawing.points.at(-1).x<pos({clientX:105,clientY:105}).x);pointer('pointerup',99,110,110);book.pages[page].pop();
preferences.smoothing=0;pointer('pointerdown',98,100,100);pointer('pointermove',98,110,110);check('smoothing can be disabled',drawing.points.at(-1).x===pos({clientX:110,clientY:110}).x);pointer('pointerup',98);book.pages[page].pop();

pointer('pointerdown',1,100,100,'touch',{width:40});pointer('pointermove',1,120,120);pointer('pointerup',1,140,140);
check('third-party stylus / wide touch draws',book.pages[page].length===initial+1);
pointer('pointerdown',2);pointer('pointermove',3);pointer('pointerup',3);
check('foreign pointer isolated',drawing!==null&&drawing.points.length===1);
pointer('pointercancel',2);check('cancel retains stroke',drawing===null&&book.pages[page].length===initial+2);
pointer('pointerdown',4);pointer('pointerdown',5,110,110,'pen');pointer('pointerup',4);
check('Pencil takes priority',activePointer===5);pointer('pointerup',5,140,140,'pen');
for(const mode of ['stylus','pencil']){$('inputMode').value=mode;pointer('pointerdown',6);check(mode+' rejects touch',drawing===null);pointer('pointerdown',7,100,100,'pen');check(mode+' accepts pen',drawing!==null);pointer('pointerup',7,110,110,'pen')}
$('inputMode').value='any';
check('toolbar cannot select text',getComputedStyle($('toolbar')).userSelect==='none');
check('canvas blocks touch scrolling',getComputedStyle(canvas).touchAction==='none');

// Regression cases use explicit timestamps to exercise browser sample ordering.
function pointerSample(type,id,x,y,time,extra={}){
  const event=new PointerEvent(type,{pointerId:id,pointerType:'pen',clientX:x,clientY:y,pressure:.6,bubbles:true,cancelable:true,...extra});
  Object.defineProperty(event,'timeStamp',{value:time});return event;
}
function emit(type,id,x,y,time,extra){canvas.dispatchEvent(pointerSample(type,id,x,y,time,extra))}
const originalSmoothing=preferences.smoothing;preferences.smoothing=0;
emit('pointerdown',200,100,100,100);emit('pointerup',200,100,100,101);
check('tap stores one point',book.pages[page].at(-1).points.length===1);
emit('pointerdown',201,100,100,110);emit('pointermove',201,102,102,111);emit('pointerup',201,102,102,112);
check('short stroke has no duplicate release',book.pages[page].at(-1).points.length===2);
emit('pointerdown',202,100,100,120);emit('pointermove',202,130,110,125);emit('pointerup',202,500,500,130);
check('distant release adds no tail',book.pages[page].at(-1).points.length===2);
const previousStroke=book.pages[page].at(-1);
emit('pointerdown',203,300,300,140);emit('pointerup',203,300,300,141);
check('separate strokes stay separate',book.pages[page].at(-1).points.length===1&&previousStroke.points.length===2);
emit('pointerdown',204,100,100,150);emit('pointermove',204,240,100,151);emit('pointerup',204,240,100,152);
check('fast valid motion retained',book.pages[page].at(-1).points.length===2);
emit('pointerdown',205,100,100,160);emit('pointermove',205,700,700,161);emit('pointermove',205,710,710,162);emit('pointerup',205,710,710,163);
check('coordinate jump terminates without bridge',drawing===null&&book.pages[page].at(-1).points.length===1);
emit('pointerdown',206,100,100,170);
const batch=pointerSample('pointermove',206,140,100,175);
batch.getCoalescedEvents=()=>[pointerSample('pointermove',206,130,100,174),pointerSample('pointermove',999,600,100,172),pointerSample('pointermove',206,120,100,172),pointerSample('pointermove',206,900,100,180),pointerSample('pointermove',206,110,100,169)];
canvas.dispatchEvent(batch);
check('coalesced samples filtered and ordered',drawing.points.length===4&&drawing.points[1].x<drawing.points[2].x&&drawing.points[2].x<drawing.points[3].x);
emit('pointermove',206,120,100,173);check('stale sample ignored',drawing.points.length===4);
emit('pointercancel',206,900,900,176);const cancelled=book.pages[page].at(-1);
emit('pointerup',206,800,800,177);emit('lostpointercapture',206,800,800,178);
check('cancel commits once without endpoint',drawing===null&&cancelled===book.pages[page].at(-1)&&cancelled.points.length===4);
emit('pointerdown',207,100,100,190);emit('pointermove',207,110,100,191);emit('lostpointercapture',207,800,800,192);emit('pointerup',207,800,800,193);
check('lost capture preserves only accepted points',drawing===null&&book.pages[page].at(-1).points.length===2);
emit('pointerdown',208,100,100,200);const invalid=pointerSample('pointermove',208,110,100,201);Object.defineProperty(invalid,'clientX',{value:NaN});canvas.dispatchEvent(invalid);
check('nonfinite sample ignored',drawing.points.length===1);emit('pointerup',208,100,100,202);
preferences.smoothing=70;emit('pointerdown',209,100,100,210);emit('pointermove',209,104,104,211);emit('pointerup',209,105,105,212);
check('filtered stroke avoids second curve correction',book.pages[page].at(-1).filtered===true);
emit('pointerdown',210,100,100,220,{pressure:.2});emit('pointermove',210,110,100,221,{pressure:.9});emit('pointerup',210,110,100,222,{pressure:0});
check('Pencil pressure retained',book.pages[page].at(-1).pressure&&Math.abs(book.pages[page].at(-1).points[0].p-.2)<1e-6&&Math.abs(book.pages[page].at(-1).points[1].p-.9)<1e-6);
const savedPage=book.pages[page];
book.pages[page]=[{filtered:true,tool:'pen',color:'#222222',width:4,smoothing:70,points:[{x:100,y:100},{x:120,y:120}]},{filtered:true,tool:'pen',color:'#222222',width:4,smoothing:70,points:[{x:300,y:100}]}];paint();
check('no rendered bridge between strokes',ctx.getImageData(400,200,10,10).data.every(v=>v===0));
book.pages[page].push({filtered:true,tool:'eraser',color:'#222222',width:20,points:[{x:100,y:100},{x:120,y:120}]});paint();
check('pixel eraser removes new ink',ctx.getImageData(218,218,4,4).data.every(v=>v===0));
book.pages[page]=savedPage;paint();
for(const mode of Object.keys(correctionLevels)){$('correctionMode').value=mode;$('correctionMode').dispatchEvent(new Event('change'));check('correction preset '+mode,preferences.smoothing===correctionLevels[mode])}
$('stabilization').value='30';$('stabilization').dispatchEvent(new Event('input'));
check('stabilization saved',JSON.parse(localStorage.getItem('notepad-preferences')).stabilization===30);
check('line preview rendered',$('linePreview').getContext('2d').getImageData(0,0,520,100).data.some(v=>v>0));
preferences.stabilization=0;preferences.smoothing=originalSmoothing;syncCorrection();

const count=book.pages[page].length;$('undo').click();check('undo',book.pages[page].length===count-1);$('redo').click();check('redo',book.pages[page].length===count);
pointer('pointerdown',8);$('addPage').click();check('switch preserves original page',page===1&&book.pages[0].length===count+1&&book.pages[1].length===0);
await save();check('IndexedDB ink round trip',(await NotepadStore.read()).books[0].pages[0].length===count+1);
const sample=document.createElement('canvas');sample.width=100;sample.height=80;sample.getContext('2d').fillStyle='#ee6633';sample.getContext('2d').fillRect(0,0,100,80);
const imageBlob=await new Promise(resolve=>sample.toBlob(resolve));
const importedImage=await Documents.importFile(new File([imageBlob],'test.png',{type:'image/png'}),()=>{});
check('image import',importedImage.book.pages.length===1&&importedImage.book.backgrounds[0].width===100);
await NotepadStore.putAssets(importedImage.assets);check('image stored as Blob',(await NotepadStore.asset(importedImage.assets[0][0])) instanceof Blob);
function pdfFixture(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream='BT /F1 20 Tf 30 300 Td (Hello PDF) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 let text='%PDF-1.4\n';const offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`}const xref=text.length;text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new File([text],'test.pdf',{type:'application/pdf'});
}
const importedPdf=await Documents.importFile(pdfFixture(),()=>{});
check('PDF imports all pages',importedPdf.book.pages.length===2&&importedPdf.assets.length===2);
check('PDF text extracted',importedPdf.book.backgrounds[0].text.includes('Hello PDF'));
await NotepadStore.putAssets(importedPdf.assets);
importedPdf.book.pages[0].push({tool:'pen',color:'#ff0000',width:8,points:[{x:100,y:100},{x:200,y:100}]});
const composed=await Documents.compose(importedPdf.book,0);check('annotated export contains ink',composed.getContext('2d').getImageData(150,100,1,1).data[0]===255);
check('document export restores editor',book.id===data.selected&&page===1);
importedPdf.book.pageSize='square';check('square export matches page format',(await Documents.compose(importedPdf.book,0)).height===W);delete importedPdf.book.pageSize;
await AIAssistant.connect();check('AI honestly disconnected',$('aiStatus').textContent.includes('ИИ не подключён')&&$('sendAI').disabled);
const beforeText=book.pages.length;insertTextPages('Ответ помощника\nПояснение решения');check('AI insertion appends new page',book.pages.length===beforeText+1&&book.pages.at(-1)[0].type==='text');
check('AI text rendered',ctx.getImageData(30,30,1480,150).data.some(value=>value>0));
const fixtureStroke={tool:'pen',color:'#222222',width:3,points:[{x:0,y:50},{x:100,y:50}]};
check('fast whole-stroke eraser intersects between samples',erasedTargets({width:10,points:[{x:50,y:0},{x:50,y:100}]},[fixtureStroke]).includes(0));
const backup=await Backups.create(data,preferences),parsed=await Backups.parse(JSON.stringify(backup));
check('backup round trip retains notes',parsed.library.books[0].pages[0].length===data.books[0].pages[0].length);
let rejected=false;try{await Backups.parse('{"format":"my-notepad-backup","version":2,"library":{"books":[]},"assets":[]}')}catch{rejected=true}check('invalid backup rejected',rejected);
const withDocument={selected:importedImage.book.id,books:[importedImage.book]};
const docBackup=await Backups.create(withDocument,preferences),docParsed=await Backups.parse(JSON.stringify(docBackup));
check('backup includes image blobs',docParsed.assets.size===1);
const oldIds=data.books.map(b=>b.id),merged=await Backups.merge(data,docParsed);
check('restore preserves existing books',oldIds.every(id=>merged.books.some(b=>b.id===id))&&merged.books.length===data.books.length+1);
check('restore remaps document IDs',merged.books.at(-1).backgrounds[0].id!==importedImage.book.backgrounds[0].id);
check('restore commits assets atomically',(await NotepadStore.asset(merged.books.at(-1).backgrounds[0].id)) instanceof Blob);
data=merged;render();await save();
$('theme').value='dark';$('theme').dispatchEvent(new Event('change'));check('theme saved',JSON.parse(localStorage.getItem('notepad-preferences')).theme==='dark');
$('settingsWidth').value='7';$('settingsWidth').dispatchEvent(new Event('input'));check('settings and toolbar share pen width',$('width').value==='7'&&preferences.width===7);
}catch(error){results.push('FAIL '+error.stack)}
document.body.innerHTML='';const output=document.createElement('pre');output.id='results';output.textContent=results.join('\n');document.body.append(output);
})();
