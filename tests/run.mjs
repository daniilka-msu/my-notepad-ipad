import {createNotepadServer} from '../server/app.mjs';
import {verifyShapeUI,verifyBrushUI,verifyTextUI,verifyImageUI,verifyChartUI,verifyAssistantUI} from './interaction.mjs';
﻿import http from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const index=await readFile(resolve(root,'index.html'),'utf8');
const tests=await readFile(resolve(root,'tests/critical.js'),'utf8');
const legacySeed='<script>localStorage.setItem("ipad-notebooks-v1",JSON.stringify({selected:"legacy",books:[{id:"legacy",name:"Старый конспект",paper:"grid",pages:[[{tool:"pen",color:"#222222",width:3,points:[{x:20,y:20},{x:30,y:30}]}]]}]}));</script>';
const html=index.replace('<script src="config.js"></script>',legacySeed+'<script src="config.js"></script>').replace('<script src="app.js"></script>','<script src="app.js"></script><script src="tests/interface.js"></script><script src="tests/paper.js"></script><script src="tests/shapes.js"></script><script src="tests/brushes.js"></script><script src="tests/text.js"></script><script src="tests/images.js"></script><script src="tests/charts.js"></script><script src="tests/critical.js"></script>');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.pdf':'application/pdf'};
let aiBackend,providerPayload,providerStatus=200;
const server=http.createServer(async(req,res)=>{
 try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.startsWith('/api/')){if(!aiBackend){res.writeHead(503).end();return}aiBackend.emit('request',req,res);return}
 if(pathname==='/test'){res.setHeader('Content-Type',types['.html']);res.end(html);return}
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+ '\\')){res.writeHead(403).end();return}
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,profile=await mkdtemp(resolve(tmpdir(),'notepad-tests-'));
aiBackend=await createNotepadServer({origin:'http://127.0.0.1:'+port,password:'browser-test-password-only',apiKey:'fake-transport-test-key',dataDirectory:resolve(profile,'quotas'),fetchImpl:async(url,options)=>{providerPayload=JSON.parse(options.body);return providerStatus===200?{ok:true,json:async()=>({choices:[{message:{content:'Ответ тестового транспорта: конспект получен'}}]})}:{ok:false,status:providerStatus,headers:new Headers()}}});
const browser=spawn(process.env.EDGE_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,`http://127.0.0.1:${port}/test`],{windowsHide:true,stdio:'ignore'});
let ws;
try{
 let debugPort;
 for(let i=0;i<100;i++){try{debugPort=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await sleep(100)}}
 if(!debugPort)throw new Error('Browser did not start');
 const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
 const target=pages.find(page=>page.type==='page');ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let id=0;const pending=new Map();const errors=[];
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id)}else if(message.method==='Page.javascriptDialogOpening'){errors.push('Unexpected browser dialog: '+message.params.type+' '+message.params.message);call('Page.handleJavaScriptDialog',{accept:false})}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text+' '+(message.params.exceptionDetails.exception?.description||''))};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(new Error('DevTools timeout: '+method))},15000);pending.set(next,response=>{clearTimeout(timer);if(response.error)reject(new Error(response.error.message));else resolve(response)});ws.send(JSON.stringify({id:next,method,params}))});
 await call('Runtime.enable');
 await call('Page.enable');
 let output;
 for(let i=0;i<300;i++){
  const response=await call('Runtime.evaluate',{expression:'document.getElementById("results")?.textContent',returnByValue:true});output=response.result?.result?.value;
  if(output)break;if(errors.length)throw new Error(errors.join('\n'));await sleep(100);
 }
 if(!output)throw new Error('Tests timed out: '+errors.join('\n'));
 console.log(output);if(output.includes('FAIL'))process.exitCode=1;
 if(!process.exitCode){
   const result=await call('Runtime.evaluate',{expression:'Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),20000))])',awaitPromise:true,returnByValue:true});
   if(!result.result?.result?.value)throw new Error('Offline cache did not install');
   await call('Page.navigate',{url:`http://127.0.0.1:${port}/`});
   async function waitForStorage(){for(let i=0;i<150;i++){const value=await call('Runtime.evaluate',{expression:'typeof storageReady!=="undefined"&&storageReady&&data.books.length>=2',returnByValue:true});if(value.result?.result?.value)return;await sleep(100)}throw new Error('Reload lost persisted notebooks')}
   await waitForStorage();console.log('PASS notebooks survive reload');
   const restoredTheme=await call('Runtime.evaluate',{expression:'document.documentElement.dataset.theme==="dark"&&preferences.width===7',returnByValue:true});
   if(!restoredTheme.result?.result?.value)throw new Error('Preferences did not survive reload');console.log('PASS preferences survive reload');
   const reopenedPaper=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="paper-persist");return b.gridMm===7&&b.pageSize==="square"&&(await Documents.compose(b,0)).toDataURL()===localStorage.getItem("test-paper-export")})()',awaitPromise:true,returnByValue:true});if(!reopenedPaper.result?.result?.value)throw new Error('Paper geometry or export changed after reopening');console.log('PASS paper geometry and annotated export survive reopening');
   const legacyPaper=await call('Runtime.evaluate',{expression:'!Object.hasOwn(data.books.find(b=>b.id==="legacy"),"gridMm")',returnByValue:true});if(!legacyPaper.result?.result?.value)throw new Error('Legacy notebook grid was changed');console.log('PASS legacy grid remains unchanged after reopening');
   for(const [width,height]of [[1024,1366],[1366,1024],[1024,768],[512,1024],[320,768]]){
     await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await sleep(150);
     const layout=await call('Runtime.evaluate',{expression:'document.documentElement.scrollWidth<=innerWidth+1&&document.getElementById("workspace").clientHeight>120&&document.getElementById("bottom").getBoundingClientRect().bottom<=innerHeight+1',returnByValue:true});
     if(!layout.result?.result?.value)throw new Error('Layout overflow at '+width+'x'+height);console.log('PASS responsive layout '+width+'x'+height);
     for(const pointerType of ['mouse','touch','pen']){
       const point=await call('Runtime.evaluate',{expression:'(()=>{const r=document.getElementById("toggleSidebar").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()',returnByValue:true});
       const {x,y}=point.result.result.value;
       const before=await call('Runtime.evaluate',{expression:'JSON.stringify([PageView.zoom,document.getElementById("workspace").scrollLeft,document.getElementById("workspace").scrollTop])',returnByValue:true});
       const tap=async()=>{
         if(pointerType==='touch'){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
         else{await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1,pointerType});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1,pointerType})}
         await sleep(60);
       };
       await tap();const opened=await call('Runtime.evaluate',{expression:'Sidebar.open&&document.getElementById("toggleSidebar").getAttribute("aria-expanded")==="true"',returnByValue:true});
       if(!opened.result?.result?.value)throw new Error('Library did not open with '+pointerType+' at '+width);
       await tap();const closed=await call('Runtime.evaluate',{expression:'!Sidebar.open&&document.getElementById("sidebarBackdrop").hidden',returnByValue:true});
       const after=await call('Runtime.evaluate',{expression:'JSON.stringify([PageView.zoom,document.getElementById("workspace").scrollLeft,document.getElementById("workspace").scrollTop])',returnByValue:true});
       if(!closed.result?.result?.value||before.result.result.value!==after.result.result.value)throw new Error('Library changed page view with '+pointerType+' at '+width);
       console.log('PASS library '+pointerType+' input '+width+'x'+height);
     }
   }
   await verifyShapeUI(call);
   await verifyBrushUI(call);
   await verifyTextUI(call,process.env.SCREENSHOT_DIR?async name=>{await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await sleep(250);const image=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(process.env.SCREENSHOT_DIR,name),Buffer.from(image.result.data,'base64'))}:null);
   await verifyImageUI(call,async content=>{const path=resolve(profile,'insert-test.png');await writeFile(path,Buffer.from(content,'base64'));return path});
   await verifyChartUI(call);
   await verifyAssistantUI(call,{endpoint:'http://127.0.0.1:'+port+'/api/assistant',payload:()=>providerPayload,setStatus:value=>providerStatus=value});
   await call('Runtime.evaluate',{expression:'save()',awaitPromise:true,returnByValue:true});
   if(process.env.SCREENSHOT_DIR){
     await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await call('Emulation.setDeviceMetricsOverride',{width:1024,height:1366,deviceScaleFactor:1,mobile:true});
     const capture=async name=>{await sleep(200);const result=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(process.env.SCREENSHOT_DIR,name),Buffer.from(result.result.data,'base64'))};
     await capture('ipad-dark.png');await call('Runtime.evaluate',{expression:'document.getElementById("openSettings").click()'});await capture('ipad-settings.png');await call('Runtime.evaluate',{expression:'document.getElementById("settingsDialog").close();preferences.theme="light";applyPreferences()'});await capture('ipad-light.png');await call('Runtime.evaluate',{expression:'document.getElementById("drawShape").click()'});await capture('shape-dialog.png');await call('Runtime.evaluate',{expression:'document.getElementById("closeShapes").click();document.querySelector("[data-tool=pen]").click()'});await capture('brush-dialog.png');await call('Runtime.evaluate',{expression:'document.getElementById("closeBrushes").click()'});
     await call('Runtime.evaluate',{expression:'document.getElementById("toggleSidebar").click()'});await capture('ipad-library.png');await call('Runtime.evaluate',{expression:'Sidebar.close();document.getElementById("extraTools").open=true'});await capture('ipad-tools.png');await call('Runtime.evaluate',{expression:'document.getElementById("extraTools").open=false;document.getElementById("focusMode").click()'});await capture('ipad-focus.png');await call('Runtime.evaluate',{expression:'document.getElementById("focusMode").click()'});
     await call('Emulation.setDeviceMetricsOverride',{width:512,height:1024,deviceScaleFactor:1,mobile:true});await capture('split-view.png');await call('Runtime.evaluate',{expression:'document.getElementById("toggleSidebar").click()'});await capture('split-library.png');await call('Runtime.evaluate',{expression:'Sidebar.close()'});await call('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});await call('Runtime.evaluate',{expression:'document.getElementById("toggleSidebar").click()'});await capture('landscape-library.png');await call('Runtime.evaluate',{expression:'Sidebar.close()'});
   }
   // Stop the origin server: the next navigation and PDF module load must use the PWA cache.
   await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
   await call('Network.enable');await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
   await call('Page.navigate',{url:`http://127.0.0.1:${port}/index.html`});await sleep(250);await waitForStorage();
   const offlinePDF=await call('Runtime.evaluate',{expression:'Documents.pdfjs().then(module=>typeof module.getDocument==="function")',awaitPromise:true,returnByValue:true});
   if(!offlinePDF.result?.result?.value)throw new Error('PDF library unavailable offline');
   const shapeRoundTrip=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="shape-gallery"),expected=JSON.parse(localStorage.getItem("test-shapes-export"));for(let i=0;i<b.pages.length;i++)if((await Documents.compose(b,i)).toDataURL()!==expected[i])return false;return true})()',awaitPromise:true,returnByValue:true});if(!shapeRoundTrip.result?.result?.value)throw new Error('Shape reopening or export changed');console.log('PASS all shapes reopen and export offline');
   const brushRoundTrip=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="brush-gallery"),expected=JSON.parse(localStorage.getItem("test-brushes-export"));for(let i=0;i<b.pages.length;i++)if((await Documents.compose(b,i)).toDataURL()!==expected[i])return false;return true})()',awaitPromise:true,returnByValue:true});if(!brushRoundTrip.result?.result?.value)throw new Error('Brush reopening or export changed');console.log('PASS all brushes reopen and export offline');
   const textRoundTrip=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="text-gallery");data.selected=b.id;page=0;render();Editor.choose("textBlock");const text=Shapes.resolve(b.pages[0],false)[0],r=canvas.getBoundingClientRect();for(const type of ["pointerdown","pointerup"])canvas.dispatchEvent(new PointerEvent(type,{pointerId:1900,pointerType:"pen",button:0,clientX:r.left+(text.x+5)/W*r.width,clientY:r.top+(text.y+5)/H*r.height,bubbles:true,cancelable:true}));document.getElementById("editText").click();const editable=document.getElementById("textDialog").open&&document.getElementById("textContent").value===text.text;document.getElementById("closeText").click();return editable&&(await Documents.compose(b,0)).toDataURL()===localStorage.getItem("test-text-export")})()',awaitPromise:true,returnByValue:true});if(!textRoundTrip.result?.result?.value)throw new Error('Text reopening or export changed');console.log('PASS editable text reopens and exports offline');
   const images=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="image-gallery");return (await Documents.compose(b,0)).toDataURL()===localStorage.getItem("test-images-export")})()',awaitPromise:true,returnByValue:true});if(!images.result?.result?.value)throw new Error('Image offline round trip failed');console.log('PASS mixed images, text, shapes and ink reopen and export offline');
   const charts=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="chart-gallery"),expected=JSON.parse(localStorage.getItem("test-charts-export"));for(let i=0;i<b.pages.length;i++)if((await Documents.compose(b,i)).toDataURL()!==expected[i])return false;return true})()',awaitPromise:true,returnByValue:true});if(!charts.result?.result?.value)throw new Error('Chart offline round trip failed');console.log('PASS all chart types reopen and export offline alongside images, text, shapes and ink');
   console.log('PASS PWA and PDF library load offline');
   const offlinePaper=await call('Runtime.evaluate',{expression:'(async()=>{const b=data.books.find(b=>b.id==="paper-persist");return (await Documents.compose(b,0)).toDataURL()===localStorage.getItem("test-paper-export")})()',awaitPromise:true,returnByValue:true});if(!offlinePaper.result?.result?.value)throw new Error('Paper unavailable offline');console.log('PASS grid and annotated export work offline');
   const offlineUI=await call('Runtime.evaluate',{expression:'(()=>{document.getElementById("toggleSidebar").click();const ok=Sidebar.open&&!!document.querySelector("#toggleSidebar svg");Sidebar.close();return ok})()',returnByValue:true});if(!offlineUI.result?.result?.value)throw new Error('Redesigned UI unavailable offline');console.log('PASS library and SVG icons work offline');
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await call('Browser.close');
}finally{ws?.close();browser.kill();server.close()}
