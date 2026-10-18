/* IndexedDB stores documents separately from ink metadata. Legacy localStorage is retained. */
const NotepadStore=(()=>{
  let database;
  function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  function complete(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Операция хранения отменена'));tx.onerror=()=>reject(tx.error)})}
  async function open(){
    if(!('indexedDB'in window))throw new Error('IndexedDB недоступна');
    const req=indexedDB.open('my-notepad',1);
    req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('library');db.createObjectStore('assets')};
    database=await request(req);database.onversionchange=()=>database.close();
  }
  async function read(){return request(database.transaction('library').objectStore('library').get('current'))}
  async function write(value){const tx=database.transaction('library','readwrite');const done=complete(tx);tx.objectStore('library').put(value,'current');await done}
  async function asset(id){return request(database.transaction('assets').objectStore('assets').get(id))}
  async function putAssets(entries){const tx=database.transaction('assets','readwrite');const done=complete(tx);for(const [id,value]of entries)tx.objectStore('assets').put(value,id);await done}
  return {open,read,write,asset,putAssets};
})();
