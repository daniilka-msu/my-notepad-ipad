import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const { chromium, webkit } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = resolve(import.meta.dirname, ".."),
  files = new Set(
    JSON.parse(
      (await readFile(resolve(root, "sw.js"), "utf8")).match(
        /const FILES=(\[[^\n]+\]);/,
      )[1],
    ).map((s) => s.slice(2) || "index.html"),
  );
files.add("sw.js");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (req, res) => {
  try {
    const path =
      decodeURIComponent(new URL(req.url, "http://local").pathname).slice(1) ||
      "index.html";
    if (!files.has(path)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(resolve(root, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
const directory = process.env.SCREENSHOT_DIR;
if (directory) await mkdir(directory, { recursive: true });
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log("PASS " + message);
}
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await (engine === "chromium"
      ? chromium.launch({ channel: "msedge" })
      : webkit.launch());
    try {
      const context = await browser.newContext({
          viewport: { width: 1024, height: 768 },
          hasTouch: true,
        }),
        page = await context.newPage(),
        errors = [];
      page.setDefaultTimeout(12000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.evaluate(async()=>{await Home.ready;if(!Library.active(data).length){const entry=Library.newBook({name:'Регрессионная тетрадь',template:'plain',pageSize:'a4',paper:'blank',color:'#5369d8',pattern:'plain'});data.books.push(entry);Home.open(entry.id,{history:false})}else Home.open(data.selected,{history:false})});
      await page.waitForFunction(
        () => typeof storageReady !== "undefined" && storageReady,
      );

      const check=async(fn,label)=>assert(await page.evaluate(fn),engine+' '+label);
      await page.locator('[data-tool=eraser]').click();
      await check(()=>tool==='eraser'&&!$('eraserDialog').open,'selects eraser without opening options');
      await page.locator('[data-tool=pen]').click();
      await check(()=>tool==='pen'&&!$('brushDialog').open,'switches to pen without opening options');
      await page.locator('[data-tool=pen]').click();
      await check(()=>$('brushDialog').open,'opens pen options on second click');
      await page.locator('[data-brush=pencil]').click();
      await page.locator('#brushColor').fill('#23856b');
      await page.locator('#brushWidth').fill('4');
      await page.locator('#brushSmoothing').fill('70');
      await page.locator('#useBrush').click();
      const pen=await page.evaluate(()=>JSON.stringify([preferences.penType,preferences.color,preferences.width,preferences.smoothing]));
      await page.locator('[data-tool=eraser]').click();
      await page.locator('[data-tool=eraser]').click();
      await page.locator('#quickEraserMode').selectOption('stroke');
      await page.locator('#eraserWidth').fill('10');
      await page.locator('#useEraser').click();
      await page.locator('[data-tool=pen]').click();
      assert(await page.evaluate(()=>JSON.stringify([preferences.penType,preferences.color,preferences.width,preferences.smoothing]))===pen,engine+' retains pen properties after eraser');
      await page.evaluate(()=>{book.pages[page]=[];redo=[];render();PageView.fitPage?.()});
      const draw=async(points,pointerType='pen')=>page.evaluate(({points,pointerType})=>{
        // Synthetic pointer events cannot acquire native browser capture.
        canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
        const r=canvas.getBoundingClientRect();
        for(let i=0;i<points.length;i++)canvas.dispatchEvent(new PointerEvent(i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove',{bubbles:true,cancelable:true,pointerId:901,pointerType,button:0,buttons:i===points.length-1?0:1,pressure:pointerType==='pen'?.5:0,clientX:r.left+points[i][0]/794*r.width,clientY:r.top+points[i][1]/1123*r.height}));
        delete canvas.setPointerCapture;delete canvas.hasPointerCapture;
      },{points,pointerType});
      await draw([[100,200],[130,200],[160,200]]);
      await draw([[100,230],[130,230],[160,230]],'touch');
      await check(()=>book.pages[page].length===2&&!!book.pages[page][0].strokeId&&book.pages[page][0].strokeId!==book.pages[page][1].strokeId,'assigns distinct stable stroke identifiers');
      await page.evaluate(()=>{const s={tool:'pen',shape:'line',color:'#222222',width:3,points:[{x:100,y:200},{x:160,y:200}]};book.pages[page].push(s);render()});
      await page.locator('[data-tool=eraser]').click();
      await draw([[130,190],[130,210]],'touch');
      await check(()=>JSON.stringify(book.pages[page].at(-1).targets)==='[0]','erases crossed handwriting without neighboring strokes or shapes');
      await check(()=>book.pages[page].at(-1).targetIds[0]===book.pages[page][0].strokeId,'records stable identity with compatible index history');
      const erased=await page.evaluate(async()=>{await save();Backups.validateLibrary(data);return (await Documents.compose(book,page)).toDataURL()});
      await page.locator('#undo').click();
      assert(await page.evaluate(async()=>(await Documents.compose(book,page)).toDataURL())!==erased,engine+' undo restores erased stroke');
      await page.locator('#redo').click();
      assert(await page.evaluate(async()=>(await Documents.compose(book,page)).toDataURL())===erased,engine+' redo restores identical export');
      await check(()=>{
        const stroke={tool:'pen',width:2,points:[{x:0,y:100},{x:200,y:100}]};
        const e={width:2,points:[{x:100,y:0},{x:100,y:200}]};
        const shape={...stroke,shape:'line'},photo={type:'image-object',...stroke};
        return JSON.stringify(erasedTargets(e,[stroke,shape,photo]))==='[0]'&&erasedTargets({...e,points:[{x:250,y:0},{x:250,y:200}]},[stroke]).length===0;
      },'continuous segment geometry catches fast crossing and protects object types');
      await check(()=>{
        const original=book.pageSize;
        try{return ['a4','a5','square'].every(size=>{
          book.pageSize=size;const scale=Paper.geometry(book).outputHeight/1123;
          const stroke={tool:'pen',width:2,points:[{x:100,y:100},{x:200,y:100}]};
          const hit=distance=>erasedTargets({width:2,points:[{x:150,y:100+distance/scale}]},[stroke]).length;
          return hit(1.9)===1&&hit(2.1)===0;
        })}finally{book.pageSize=original}
      },'eraser radius uses physical document geometry on A4, A5 and square paper');
      await check(async()=>{
        const backup=await Backups.create(data,preferences),parsed=await Backups.parse(JSON.stringify(backup));
        return parsed.library.books.find(b=>b.id===book.id).pages[page][0].strokeId===book.pages[page][0].strokeId;
      },'JSON backup preserves stroke identity and erasure history');
      await page.evaluate(()=>{Editor.choose('eraser');book.pages[page].push({tool:'pen',width:2,color:'#222222',points:[{x:300,y:200},{x:300,y:600}]});render()});
      await draw([[100,400],[500,400]],'touch');
      await check(()=>book.pages[page].at(-1).tool==='stroke-eraser'&&book.pages[page].at(-1).targets.includes(book.pages[page].length-2),'fast eraser gesture crosses unsampled space without handwriting jump filtering');
      await page.locator('#undo').click();
      await page.locator('[data-tool=eraser]').click();
      if(directory)await page.screenshot({path:resolve(directory,engine+'-eraser-options.png')});
      await page.locator('#useEraser').click();
      await page.locator('#undo').click();
      const rectangle=await page.locator('#canvas').boundingBox();
      await page.mouse.move(rectangle.x+rectangle.width*.8,rectangle.y+rectangle.height*.1);
      await page.mouse.down();await page.mouse.move(rectangle.x+rectangle.width*.8,rectangle.y+rectangle.height*.15,{steps:4});await page.mouse.up();
      await check(()=>!drawing&&book.pages[page].at(-1).tool==='stroke-eraser','native mouse capture completes eraser input');
      await page.locator('#undo').click();
      await page.locator('#openSettings').click();
      await page.locator('#openToolOptions').check();
      await page.locator('#closeSettings').click();
      await page.locator('[data-tool=pen]').click();
      await check(()=>$('brushDialog').open,'optional first-selection settings work');
      await page.locator('#useBrush').click();
      await page.evaluate(async()=>{await save()});
      await page.evaluate(()=>navigator.serviceWorker.ready);
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      if(engine==='webkit')await new Promise(r=>{server.close(r);server.closeAllConnections()});
      else await context.setOffline(true);
      await page.reload();
      await page.evaluate(async()=>{await Home.ready;Home.open(data.selected,{history:false})});
      await page.waitForFunction(()=>storageReady);
      await check(()=>preferences.openToolOptions===true&&preferences.eraserMode==='stroke'&&preferences.eraserWidth===10,'preserves options offline');
      assert(await page.evaluate(async()=>(await Documents.compose(book,page)).toDataURL())===erased,engine+' reopens identical saved erasure offline');
      assert(errors.length===0,engine+' no script errors: '+errors.join(','));
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
}
