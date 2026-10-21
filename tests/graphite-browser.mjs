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


const metrics=[];
try {
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({channel:'msedge'}):webkit.launch());
  try{
   const page=await browser.newPage({viewport:{width:1024,height:768}});await page.goto(url);
   await page.evaluate(async()=>{await Home.ready;const b=Library.newBook({name:'Graphite',template:'plain',pageSize:'a4',paper:'grid',color:'#5369d8',pattern:'plain'});data.books.push(b);Home.open(b.id,{history:false})});
   await page.waitForFunction(()=>storageReady&&!Home.active);
   await page.locator('[data-tool=pen]').click();await page.locator('[data-brush=pencil]').click();await page.locator('#useBrush').click();
   const r=await page.locator('#canvas').boundingBox();await page.mouse.move(r.x+100/794*r.width,r.y+150/1123*r.height);await page.mouse.down();await page.mouse.move(r.x+250/794*r.width,r.y+160/1123*r.height,{steps:20});await page.mouse.up();
   assert(await page.evaluate(()=>book.pages[page].at(-1).textureVersion===2&&book.pages[page].at(-1).rawPoints.length>10),engine+' real pencil UI writes versioned vector graphite');
   const png=await page.evaluate(async()=>(await Documents.compose(book,page)).toDataURL());await page.evaluate(()=>save());
   await page.reload();await page.evaluate(()=>Home.ready);await page.waitForFunction(()=>storageReady);
   assert(await page.evaluate(async()=>(await Documents.compose(book,page)).toDataURL())===png,engine+' graphite saves and reopens with identical export');
   const result=await page.evaluate(()=>{
    const target=document.createElement('canvas');target.width=target.height=600;const c=target.getContext('2d');
    const s={tool:'pen',brushVersion:1,penType:'pencil',color:'#5369d8',width:3,pressure:true,seed:17,tightSampling:true,points:Array.from({length:2000},(_,i)=>({x:20+i*.1,y:100+Math.sin(i*.03)*20,p:.4+Math.sin(i*.02)*.3,pressureValid:true}))};
    function trial(version){c.clearRect(0,0,600,600);const start=performance.now();Brushes.render(c,{...s,textureVersion:version});return performance.now()-start}
    for(let i=0;i<3;i++){trial(1);trial(2)}
    const before=[],after=[];for(let i=0;i<16;i++){if(i%2){after.push(trial(2));before.push(trial(1))}else{before.push(trial(1));after.push(trial(2))}}
    const median=a=>a.sort((x,y)=>x-y)[8];
    c.clearRect(0,0,600,600);Brushes.render(c,{...s,textureVersion:2});const first=target.toDataURL();c.clearRect(0,0,600,600);Brushes.render(c,{...s,textureVersion:2});const deterministic=first===target.toDataURL();
    const pixels=c.getImageData(0,0,600,600).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;
    return{points:s.points.length,beforeMedianMs:median(before),afterMedianMs:median(after),deterministic,visible};
   });
   assert(result.deterministic&&result.visible>100,engine+' graphite texture is deterministic and visible');metrics.push({engine,...result});
   const tilt=await page.evaluate(()=>{
    const image=document.createElement('canvas');image.width=image.height=200;const c=image.getContext('2d');
    const s={tool:'pen',brushVersion:1,penType:'calligraphy',color:'#222222',width:12,points:[{x:100,y:100,p:.5,pressureValid:true,tiltX:40,tiltY:0}]};
    Brushes.render(c,{...s,tilt:false});const fixed=image.toDataURL();c.clearRect(0,0,200,200);Brushes.render(c,{...s,tilt:true});return fixed!==image.toDataURL();
   });assert(tilt,engine+' opt-in hardware tilt changes calligraphy nib orientation');
  }finally{await browser.close()}
 }
 console.log('MEASUREMENTS '+JSON.stringify(metrics));
}finally{server.close();server.closeAllConnections()}
