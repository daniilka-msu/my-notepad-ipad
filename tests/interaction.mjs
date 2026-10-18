function driver(call){
  async function evaluate(expression){const response=await call('Runtime.evaluate',{expression,returnByValue:true});if(response.result?.exceptionDetails)throw new Error(response.result.exceptionDetails.text);return response.result?.result?.value}
  async function click(selector){
    const p=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  }
  async function drag(a,b){const r=await evaluate('(()=>{const r=canvas.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()');const point=p=>({x:r.x+p.x/794*r.w,y:r.y+p.y/1123*r.h});await call('Input.dispatchMouseEvent',{type:'mousePressed',...point(a),button:'left',buttons:1,clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point(b),button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point(b),button:'left',buttons:0,clickCount:1})}
  return {evaluate,click,drag};
}
export async function verifyShapeUI(call){
  const {evaluate,click,drag}=driver(call);
  await click('#toggleSidebar');await evaluate('document.querySelectorAll(".book").forEach(b=>{if(b.textContent.includes("Фигуры 2.1"))b.id="testGalleryButton"})');await click('#testGalleryButton');await click('#fitPage');
  const original=await evaluate('JSON.stringify(book.pages[page])');
  await click('#extraTools summary');await click('#drawShape');if(!await evaluate('document.getElementById("shapeDialog").open'))throw new Error('Shape UI did not open');
  await evaluate('document.getElementById("shapeKind").value="circle"');await click('#applyShape');
  await drag({x:200,y:300},{x:260,y:360});if(!await evaluate('book.pages[page].at(-1).shape==="circle"'))throw new Error('Shape could not be drawn through UI');
  await click('#extraTools summary');await click('#selectShape');await drag({x:230,y:330},{x:250,y:350});if(!await evaluate('book.pages[page].at(-1).type==="shape-edit"'))throw new Error('Shape could not be moved through UI');
  await click('#undo');await click('#undo');if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('UI shape undo did not restore original');
  await evaluate('Editor.choose("pen")');console.log('PASS real mouse UI opens, draws, selects, moves and undoes a circle');
}

export async function verifyBrushUI(call){
  const {evaluate,click,drag}=driver(call),original=await evaluate('JSON.stringify(book.pages[page])');
  await click('[data-tool=pen]');if(!await evaluate('document.getElementById("brushDialog").open'))throw new Error('Brush menu did not open');
  await click('[data-brush=pencil]');await click('#useBrush');await drag({x:300,y:400},{x:400,y:450});
  if(!await evaluate('book.pages[page].at(-1).penType==="pencil"&&book.pages[page].at(-1).brushVersion===1'))throw new Error('Pencil could not draw through UI');
  await click('#undo');if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('Pencil UI undo did not restore page');
  console.log('PASS real mouse UI selects pencil, draws and undoes a textured stroke');
}
export async function verifyTextUI(call,capture){
  const {evaluate,click,drag}=driver(call);
  await click('#toggleSidebar');await evaluate('document.querySelectorAll(".book").forEach(b=>{if(b.textContent.includes("Текст 2.1"))b.id="testTextGalleryButton"})');await click('#testTextGalleryButton');await click('#fitPage');
  const original=await evaluate('JSON.stringify(book.pages[page])');
  await click('#extraTools summary');await click('#textTool');
  await drag({x:100,y:600},{x:100,y:600});if(!await evaluate('document.getElementById("textDialog").open'))throw new Error('Text tap did not open native editor');
  await call('Input.insertText',{text:'Настоящий ввод с клавиатуры'});await click('#saveText');
  if(!await evaluate('book.pages[page].at(-1).text==="Настоящий ввод с клавиатуры"'))throw new Error('Keyboard input was not stored');
  await drag({x:110,y:610},{x:150,y:660});if(!await evaluate('Math.abs(TextTools.current().x-140)<1'))throw new Error('Text UI drag failed');
  await click('#editText');await call('Input.insertText',{text:' Продолжение'});await click('#saveText');
  if(!await evaluate('TextTools.current().text.includes("Продолжение")'))throw new Error('Text UI editing failed');
  if(capture){await capture('text-page.png');await click('#editText');await capture('text-editor.png');await click('#closeText')}
  await click('#deleteText');await click('#undo');await click('#undo');await click('#undo');await click('#undo');
  if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('Text UI undo did not restore original');
  console.log('PASS text tool accepts keyboard input, moves, edits, deletes and undoes through real UI');
}
