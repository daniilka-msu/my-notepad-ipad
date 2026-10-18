export async function verifyShapeUI(call) {
  async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,returnByValue:true});if(response.result?.exceptionDetails)throw new Error(response.result.exceptionDetails.text);return response.result?.result?.value}
  async function click(selector){
    const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  }
  await click('#toggleSidebar');await evaluate('document.querySelectorAll(".book").forEach(b=>{if(b.textContent.includes("Фигуры 2.1"))b.id="testGalleryButton"})');await click('#testGalleryButton');await click('#fitPage');
  const original=await evaluate('JSON.stringify(book.pages[page])');
  await click('#extraTools summary');await click('#drawShape');if(!await evaluate('document.getElementById("shapeDialog").open'))throw new Error('Shape UI did not open');
  await evaluate('document.getElementById("shapeKind").value="circle"');await click('#applyShape');
  async function drag(a,b){const r=await evaluate('(()=>{const r=canvas.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()');const point=p=>({x:r.x+p.x/794*r.w,y:r.y+p.y/1123*r.h});await call('Input.dispatchMouseEvent',{type:'mousePressed',...point(a),button:'left',buttons:1,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point(b),button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point(b),button:'left',buttons:0,clickCount:1})}
  await drag({x:200,y:300},{x:260,y:360});if(!await evaluate('book.pages[page].at(-1).shape==="circle"'))throw new Error('Shape could not be drawn through UI');
  await click('#extraTools summary');await click('#selectShape');await drag({x:230,y:330},{x:250,y:350});if(!await evaluate('book.pages[page].at(-1).type==="shape-edit"'))throw new Error('Shape could not be moved through UI');
  await click('#undo');await click('#undo');if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('UI shape undo did not restore original');
  await evaluate('Editor.choose("pen")');console.log('PASS real mouse UI opens, draws, selects, moves and undoes a circle');
}
