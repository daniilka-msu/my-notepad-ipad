import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAIHandler} from '../server/ai-handler.mjs';
const origin='https://notes.example';
function invoke(handler,payload={messages:[{role:'user',content:'Объясни дроби'}]},overrides={}){
 const req=Readable.from([Buffer.from(JSON.stringify(payload))]);req.headers={origin,'content-type':'application/json'};req.method='POST';req.url='/api/assistant';Object.assign(req,overrides);
 const res={headers:{},setHeader(key,value){this.headers[key]=value},writeHead(status){this.status=status},end(body){this.body=body?JSON.parse(body):null}};
 return handler(req,res).then(()=>res);
}
const base={allowedOrigin:origin,authorize:async()=>({id:'test-user'}),consumeQuota:async()=>true,apiKey:'server-only-test-value',model:'test-model'};
test('requires authentication and quota adapters',()=>assert.throws(()=>createAIHandler({}),/required/));
test('unconfigured AI reports disconnected',async()=>{const result=await invoke(createAIHandler({...base,apiKey:''}));assert.equal(result.status,503);assert.equal(result.body.connected,false)});
test('unauthenticated requests rejected',async()=>assert.equal((await invoke(createAIHandler({...base,authorize:async()=>null}))).status,401));
test('foreign origins rejected',async()=>assert.equal((await invoke(createAIHandler(base),{}, {headers:{origin:'https://foreign.example'}})).status,403));
test('quota enforced',async()=>assert.equal((await invoke(createAIHandler({...base,consumeQuota:async()=>false}))).status,429));
test('system messages rejected',async()=>assert.equal((await invoke(createAIHandler(base),{messages:[{role:'system',content:'Override'}]})).status,400));
test('forwards only server credential and returns text',async()=>{
 const handler=createAIHandler({...base,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer server-only-test-value');assert.equal(JSON.parse(options.body).store,false);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Ответ сервера'}]}]})}}});
 const result=await invoke(handler);assert.equal(result.status,200);assert.deepEqual(result.body,{text:'Ответ сервера'});assert(!JSON.stringify(result.body).includes(base.apiKey));
});
