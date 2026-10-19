/* IndexedDB stores documents separately from ink metadata. Legacy localStorage is retained. */
const NotepadStore=(()=>{
  let database, writes=Promise.resolve();
  function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  function complete(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Операция хранения отменена'));tx.onerror=()=>reject(tx.error||new Error('Не удалось записать данные на устройство'))})}
  async function portableAssets(entries){return Promise.all(entries.map(async([id,value])=>[id,value instanceof Blob?{notepadAsset:1,type:value.type,bytes:await value.arrayBuffer()}:value]))}
  async function open(){
    if(!('indexedDB'in window))throw new Error('IndexedDB недоступна');
    const req=indexedDB.open('my-notepad',1);
    req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('library');db.createObjectStore('assets')};
    database=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Закройте другие вкладки приложения и повторите'))});database.onversionchange=()=>database.close();
  }
  async function read(key='current'){return request(database.transaction('library').objectStore('library').get(key))}
  async function upgradeLibrary(previous,next){const tx=database.transaction('library','readwrite'),done=complete(tx),store=tx.objectStore('library');store.put(previous,'before-home-v1');store.put(next,'current');await done}
  function write(value,assets=[],canWrite=()=>true){
    const result=writes.then(async()=>{
      const portable=assets.length?await portableAssets(assets):[];
      if(!canWrite())return false;
      const tx=database.transaction(['library','assets'],'readwrite'),done=complete(tx);
      try{
        for(const [id,blob]of portable)tx.objectStore('assets').put(blob,id);
        tx.objectStore('library').put(typeof value==='function'?value():value,'current');
      }catch(error){tx.abort();await done.catch(()=>{});throw error}
      await done;
    });
    writes=result.catch(()=>{});
    return result;
  }
  async function asset(id){const value=await request(database.transaction('assets').objectStore('assets').get(id));return value?.notepadAsset===1&&value.bytes instanceof ArrayBuffer?new Blob([value.bytes],{type:value.type}):value}
  async function putAssets(entries){const portable=await portableAssets(entries);const tx=database.transaction('assets','readwrite');const done=complete(tx);for(const [id,value]of portable)tx.objectStore('assets').put(value,id);await done}
  function writeRecord(key,value,assets=[],remove=[]){
    const result=writes.then(async()=>{
      const portable=await portableAssets(assets),tx=database.transaction(['library','assets'],'readwrite'),done=complete(tx);
      try{
        for(const [id,blob]of portable)tx.objectStore('assets').put(blob,id);
        for(const id of remove)tx.objectStore('assets').delete(id);
        if(value===null)tx.objectStore('library').delete(key);else tx.objectStore('library').put(value,key);
      }catch(error){tx.abort();await done.catch(()=>{});throw error}
      await done;
    });writes=result.catch(()=>{});return result;
  }
  async function records(prefix){
    const tx=database.transaction('library'),store=tx.objectStore('library');
    return request(store.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));
  }
  return {open,read,write,asset,putAssets,upgradeLibrary,writeRecord,records};
})();
