import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,extname,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {createQuota} from './quota.mjs';
import {createGroqHandler} from './groq-handler.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream'};
export async function createNotepadServer({origin,password,apiKey,model='openai/gpt-oss-120b',dataDirectory=resolve(homedir(),'.my-notepad-server'),fetchImpl=fetch,perMinute=6,perDay=20,now=Date.now}={}){
  const address=new URL(origin);if(address.origin!==origin||address.username||address.password||!(address.protocol==='https:'||(address.protocol==='http:'&&['localhost','127.0.0.1'].includes(address.hostname))))throw new Error('Use an HTTPS origin or local loopback HTTP');
  if(typeof password!=='string'||password.length<16||password.length>256)throw new Error('NOTEPAD_PASSWORD must contain 16–256 characters');
  if(!isAbsolute(dataDirectory)||dataDirectory===root||dataDirectory.startsWith(root+sep))throw new Error('Data directory must be absolute and outside the public repository');
  if(model!=='openai/gpt-oss-120b'&&model!=='openai/gpt-oss-20b')throw new Error('Use a documented Groq free-tier production model');
  const files=new Set(JSON.parse((await readFile(resolve(root,'sw.js'),'utf8')).match(/const FILES=(\[[^\n]+\]);/)[1]).map(path=>path.slice(2)||'index.html'));files.add('sw.js');
  const salt=randomBytes(16),passwordHash=scryptSync(password,salt,32),sessions=new Map();let attempts=[];const expires=8*60*60*1000;
  const cookieName=address.protocol==='https:'?'__Host-notepad-session':'notepad-session';
  const cookie=(token,age)=>`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${address.protocol==='https:'?'; Secure':''}`;
  function session(req){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const key=createHash('sha256').update(token).digest('hex'),until=sessions.get(key);if(!until||until<now()){sessions.delete(key);return null}return key}
  const handleAI=createGroqHandler({allowedOrigin:origin,apiKey,model,fetchImpl,authorize:async req=>session(req),consumeQuota:createQuota({directory:dataDirectory,perMinute,perDay,now})});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
    try{
      const path=new URL(req.url,'http://local').pathname;
      if(path.startsWith('/api/')){
        if(req.headers.origin&&req.headers.origin!==origin)return reply(403,{error:'origin_rejected'});
        if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin')}
        if(req.method==='OPTIONS'){if(req.headers.origin!==origin)return reply(403,{error:'origin_rejected'});res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return}
        if(path==='/api/assistant/login'){
          if(req.method!=='POST'||req.headers.origin!==origin)return reply(403,{error:'origin_rejected'});
          attempts=attempts.filter(t=>t>now()-15*60000);if(attempts.length>=10)return reply(429,{error:'login_rate_limit'});attempts.push(now());
          if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'json_required'});
          const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2048)return reply(413,{error:'request_too_large'});chunks.push(chunk)}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply(400,{error:'invalid_json'})}
          if(typeof body.password!=='string'||body.password.length>256||!timingSafeEqual(passwordHash,scryptSync(body.password,salt,32)))return reply(401,{error:'invalid_password'});
          for(const [key,until]of sessions)if(until<now())sessions.delete(key);if(sessions.size>=20)sessions.delete(sessions.keys().next().value);
          const token=randomBytes(32).toString('hex');sessions.set(createHash('sha256').update(token).digest('hex'),now()+expires);res.setHeader('Set-Cookie',cookie(token,expires/1000));return reply(200,{ok:true});
        }
        if(path==='/api/assistant/logout'){
          if(req.method!=='POST'||req.headers.origin!==origin)return reply(403,{error:'origin_rejected'});const key=session(req);if(key)sessions.delete(key);res.setHeader('Set-Cookie',cookie('',0));return reply(200,{ok:true});
        }
        if(path==='/api/assistant'||path==='/api/assistant/status')return await handleAI(req,res);
        return reply(404,{error:'not_found'});
      }
      if(!['GET','HEAD'].includes(req.method))return reply(405,{error:'method_not_allowed'});
      if(path==='/config.js'){res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:'window.NOTEPAD_CONFIG=Object.freeze('+JSON.stringify({aiEndpoint:origin+'/api/assistant'})+');');return}
      const relative=decodeURIComponent(path).replace(/^\//,'')||'index.html';if(!files.has(relative))return reply(404,{error:'not_found'});
      const file=await realpath(resolve(root,relative));if(!file.startsWith(root+sep))return reply(403,{error:'forbidden'});const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':relative==='sw.js'?'no-cache':'public, max-age=0'});res.end(req.method==='HEAD'?undefined:content);
    }catch{return reply(500,{error:'server_unavailable'})}
  });server.requestTimeout=20000;server.headersTimeout=10000;return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createNotepadServer({origin:process.env.NOTEPAD_ORIGIN,password:process.env.NOTEPAD_PASSWORD,apiKey:process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',dataDirectory:process.env.NOTEPAD_DATA_DIR||resolve(homedir(),'.my-notepad-server')});
  const port=Number(process.env.PORT||8080);server.listen(port,'127.0.0.1',()=>console.log(`My Notepad server listening on loopback port ${port}. Use HTTPS reverse proxy for public access.`));
}
