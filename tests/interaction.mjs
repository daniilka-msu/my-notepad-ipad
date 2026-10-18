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
export async function verifyImageUI(call,fixture){
  const {evaluate,click,drag}=driver(call);
  await click('#toggleSidebar');await evaluate('document.querySelectorAll(".book").forEach(b=>{if(b.textContent.includes("Изображения 2.1"))b.id="testImageGalleryButton"})');await click('#testImageGalleryButton');await click('#fitPage');
  const original=await evaluate('JSON.stringify(book.pages[page])');
  const file=await fixture(await evaluate('(()=>{const c=document.createElement("canvas");c.width=120;c.height=80;const ctx=c.getContext("2d");ctx.fillStyle="#2070b0";ctx.fillRect(0,0,120,80);return c.toDataURL().split(",")[1]})()'));
  await click('#extraTools summary');
  const doc=await call('DOM.getDocument');const input=await call('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#imageFile'});await call('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:[file]});
  for(let i=0;i<100;i++){if(await evaluate('book.pages[page].at(-1)?.type==="image-object"'))break;await new Promise(r=>setTimeout(r,50))}
  if(!await evaluate('ObjectTools.current()?.type==="image-object"'))throw new Error('Image file picker import failed');
  await drag({x:70,y:90},{x:100,y:130});await click('#editObject');await evaluate('document.getElementById("imageRotation").value="90"');await click('#applyImage');
  if(!await evaluate('ObjectTools.current()?.rotation===90&&Math.abs(ObjectTools.current().x-90)<1'))throw new Error('Image manipulation UI failed');
  await click('#deleteObject');for(let i=0;i<4;i++)await click('#undo');if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('Image UI undo failed');
  console.log('PASS system file input inserts image; UI moves, rotates, deletes and undoes alongside ink and text');
}
export async function verifyChartUI(call){
  const {evaluate,click,drag}=driver(call);
  await click('#toggleSidebar');await evaluate('document.querySelectorAll(".book").forEach(b=>{if(b.textContent.includes("Графики 2.1"))b.id="testChartGalleryButton"})');await click('#testChartGalleryButton');await click('#fitPage');
  const original=await evaluate('JSON.stringify(book.pages[page])');await click('#extraTools summary');await click('#insertChart');
  await evaluate('document.getElementById("chartKind").value="function";document.getElementById("chartForm").dispatchEvent(new Event("input"))');if(!await evaluate('document.getElementById("chartDialog").scrollWidth<=document.getElementById("chartDialog").clientWidth+1'))throw new Error('Chart editor overflows narrow viewport');await click('#chartExpression');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await call('Input.insertText',{text:'x^2-1'});await click('#applyChart');
  if(!await evaluate('ObjectTools.current()?.expression==="x^2-1"'))throw new Error('Function graph input UI failed: '+await evaluate('JSON.stringify({value:document.getElementById("chartExpression").value,focus:document.activeElement?.id,error:document.getElementById("chartError").textContent,open:document.getElementById("chartDialog").open,current:ObjectTools.current()})'));await drag({x:100,y:150},{x:140,y:180});await click('#editObject');if(!await evaluate('document.getElementById("chartExpression").value==="x^2-1"'))throw new Error('Graph UI did not restore expression');await click('#closeChart');await click('#deleteObject');for(let i=0;i<3;i++)await click('#undo');
  if(await evaluate('JSON.stringify(book.pages[page])')!==original)throw new Error('Graph UI undo failed');console.log('PASS graph editor keyboard input, insertion, movement, reopening and undo through real UI');
}
export async function verifyAssistantUI(call,backend){
  const {evaluate,click}=driver(call);
  async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50))}throw new Error('Assistant UI timeout: '+expression)}
  const snapshot=await evaluate('JSON.stringify(book.pages)');await click('#openSettings');await evaluate('document.getElementById("aiSetup").open=true;document.getElementById("aiEndpoint").value='+JSON.stringify(backend.endpoint));await click('#saveAIEndpoint');await until('!document.getElementById("aiAuth").hidden');
  await click('#aiPassword');await call('Input.insertText',{text:'browser-test-password-only'});await click('#aiLogin');await until('document.getElementById("aiAuthStatus").textContent==="Вход выполнен"&&!document.getElementById("sendAI").disabled');
  if(!await evaluate('document.getElementById("aiPassword").value===""&&document.getElementById("attachPage").disabled'))throw new Error('Session privacy or image capabilities failed');
  await click('#closeSettings');await click('#toggleSidebar');await click('#openAI');await until('!document.getElementById("sendAI").disabled');await click('#attachDocument');await click('#chatInput');await call('Input.insertText',{text:'Объясни мой смешанный конспект'});await click('#sendAI');await until('document.getElementById("aiStatus").textContent==="Ответ получен"');
  const payload=backend.payload();if(payload.messages.some(m=>Array.isArray(m.content))||!payload.messages.some(m=>m.content.includes('График + фотография + почерк')))throw new Error('Assistant did not receive editable note text safely');
  backend.setStatus(429);await click('#chatInput');await call('Input.insertText',{text:'Повторный вопрос'});await click('#sendAI');await until('document.getElementById("aiStatus").textContent.includes("Лимит")');if(!await evaluate('document.getElementById("chatInput").value==="Повторный вопрос"'))throw new Error('Quota error discarded question');backend.setStatus(200);
  await click('#closeAI');await click('#openSettings');await click('#aiLogout');await until('document.getElementById("aiAuthStatus").textContent==="Вы вышли"&&document.getElementById("sendAI").disabled');await click('#closeSettings');
  if(await evaluate('JSON.stringify(book.pages)')!==snapshot)throw new Error('Assistant changed original notes');console.log('PASS real assistant UI authenticates with server, sends mixed-note text, handles provider quota, clears password and logs out without changing notes (mock provider transport)');
}
