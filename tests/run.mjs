import http from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const index=await readFile(resolve(root,'index.html'),'utf8');
const tests=await readFile(resolve(root,'tests/critical.js'),'utf8');
const html=index.replace('<script src="app.js"></script>','<script src="app.js"></script><script src="tests/critical.js"></script>');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
 try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/test'){res.setHeader('Content-Type',types['.html']);res.end(html);return}
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+ '\\')){res.writeHead(403).end();return}
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,profile=await mkdtemp(resolve(tmpdir(),'notepad-tests-'));
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
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id)}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text+' '+(message.params.exceptionDetails.exception?.description||''))};
 const call=(method,params={})=>new Promise(resolve=>{const next=++id;pending.set(next,resolve);ws.send(JSON.stringify({id:next,method,params}))});
 await call('Runtime.enable');
 let output;
 for(let i=0;i<300;i++){
  const response=await call('Runtime.evaluate',{expression:'document.getElementById("results")?.textContent',returnByValue:true});output=response.result?.result?.value;
  if(output)break;if(errors.length)throw new Error(errors.join('\n'));await sleep(100);
 }
 if(!output)throw new Error('Tests timed out: '+errors.join('\n'));
 console.log(output);if(output.includes('FAIL'))process.exitCode=1;
 await call('Browser.close');
}finally{ws?.close();browser.kill();server.close()}
