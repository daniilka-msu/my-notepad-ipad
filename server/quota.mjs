import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export function createQuota({directory,perMinute=6,perDay=20,now=Date.now}){
  if(!directory||![perMinute,perDay].every(n=>Number.isInteger(n)&&n>0))throw new Error('Persistent directory and positive limits required');
  let queue=Promise.resolve();
  return function consume(){const work=queue.then(async()=>{
    await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,'quota.json');let state;
    try{state=JSON.parse(await readFile(path,'utf8'));if(!state||typeof state.day!=='string'||!Number.isInteger(state.minute)||!Number.isInteger(state.daily)||state.daily<0||!Number.isInteger(state.minutely)||state.minutely<0)throw new Error('Invalid quota state')}
    catch(error){if(error.code!=='ENOENT')throw error;state={day:'',minute:0,daily:0,minutely:0}}
    const time=now(),day=new Date(time).toISOString().slice(0,10),minute=Math.floor(time/60000);if(state.day!==day){state.day=day;state.daily=0}if(state.minute!==minute){state.minute=minute;state.minutely=0}
    if(state.daily>=perDay||state.minutely>=perMinute)return false;
    state.daily++;state.minutely++;const temp=path+'.tmp';await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,path);return true;
  });queue=work.catch(()=>{});return work};
}
