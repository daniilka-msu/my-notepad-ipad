(async()=>{
const results=[];
function check(name,condition){results.push((condition?'PASS ':'FAIL ')+name)}
function pointer(type,id,x=100,y=100,pointerType='touch',extra={}){canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType,clientX:x,clientY:y,bubbles:true,cancelable:true,...extra}))}
canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
try{
const initial=book.pages[page].length;
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
const count=book.pages[page].length;$('undo').click();check('undo',book.pages[page].length===count-1);$('redo').click();check('redo',book.pages[page].length===count);
pointer('pointerdown',8);$('addPage').click();check('switch preserves original page',page===1&&book.pages[0].length===count+1&&book.pages[1].length===0);
}catch(error){results.push('FAIL '+error.stack)}
document.body.innerHTML='';const output=document.createElement('pre');output.id='results';output.textContent=results.join('\n');document.body.append(output);
})();
