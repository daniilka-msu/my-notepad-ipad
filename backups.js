/* Backups contain user notes and document backgrounds, never service credentials. */
const Backups=(()=>{
  const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e8;
  function validBrush(s){return s.brushVersion===undefined||(s.brushVersion===1&&Object.hasOwn(Brushes.labels,s.penType)&&Number.isInteger(s.seed)&&s.seed>=0&&s.seed<=4294967295)}
  function validShape(s){return isObject(s)&&validBrush(s)&&s.type===undefined&&Shapes.kinds.includes(s.shape)&&s.tool==='pen'&&finite(s.width)&&s.width>0&&s.width<=1000&&/^#[0-9a-f]{6}$/i.test(s.color)&&Array.isArray(s.points)&&s.points.length<=1000&&s.points.every(p=>isObject(p)&&finite(p.x)&&finite(p.y))&&(s.opacity===undefined||(finite(s.opacity)&&s.opacity>=0&&s.opacity<=1))&&(s.fill==null||/^#[0-9a-f]{6}$/i.test(s.fill))&&['shapeStart','shapeEnd'].every(key=>s[key]===undefined||(isObject(s[key])&&finite(s[key].x)&&finite(s[key].y)))}
  function validateLibrary(library){
    if(!isObject(library)||!Array.isArray(library.books)||!library.books.length)throw new Error('Нет тетрадей в резервной копии');
    const ids=new Set();
    for(const b of library.books){
      if(!isObject(b)||typeof b.id!=='string'||ids.has(b.id)||typeof b.name!=='string'||!Array.isArray(b.pages)||!b.pages.length)throw new Error('Неверная структура тетради');
      ids.add(b.id);if(!['grid','lines','dots','blank'].includes(b.paper))throw new Error('Неизвестная разлиновка');
      if(b.paperColor&&!['white','cream','gray','black'].includes(b.paperColor))throw new Error('Неверный цвет бумаги');
      if(b.gridMm!==undefined&&![5,7,10].includes(b.gridMm))throw new Error('Неверный размер клетки');
      if(b.pageSize&&!['a4','a5','square'].includes(b.pageSize))throw new Error('Неверный размер бумаги');
      if(b.backgrounds!==undefined&&(!Array.isArray(b.backgrounds)||b.backgrounds.length!==b.pages.length))throw new Error('Фоны не соответствуют страницам');
      for(const bg of b.backgrounds||[])if(bg!==null&&(!isObject(bg)||typeof bg.id!=='string'||!finite(bg.width)||bg.width<=0||!finite(bg.height)||bg.height<=0||(bg.text!==undefined&&typeof bg.text!=='string')))throw new Error('Повреждён фон страницы');
      for(const items of b.pages){if(!Array.isArray(items))throw new Error('Повреждена страница');for(const [index,s]of items.entries()){
        if(!isObject(s))throw new Error('Повреждён штрих');
        if(s.type==='shape-edit'){if(!Number.isInteger(s.target)||s.target<0||s.target>=index||!items[s.target].shape||(s.value!==null&&!validShape(s.value)))throw new Error('Повреждено изменение фигуры');continue}
        if(s.type==='text-block'){if(!TextBlocks.valid(s))throw new Error('Повреждён текстовый блок');continue}
        if(s.type==='text-edit'){if(!Number.isInteger(s.target)||s.target<0||s.target>=index||items[s.target].type!=='text-block'||(s.value!==null&&!TextBlocks.valid(s.value)))throw new Error('Повреждено изменение текста');continue}
        if(s.type==='chart-object'){if(!Charts.valid(s))throw new Error('Повреждена диаграмма');continue}
        if(s.type==='image-object'){if(!ImageObjects.valid(s))throw new Error('Повреждено изображение');continue}
        if(s.type==='object-edit'){if(!Number.isInteger(s.target)||s.target<0||s.target>=index||!['image-object','chart-object'].includes(items[s.target].type)||(s.value!==null&&(s.value.type!==items[s.target].type||!(s.value.type==='image-object'?ImageObjects.valid(s.value):Charts.valid(s.value)))))throw new Error('Повреждено изменение объекта');continue}
        if(s.type==='object-order'){if(!Number.isInteger(s.target)||s.target<0||s.target>=index||items[s.target].type!=='image-object'||!['front','back'].includes(s.placement))throw new Error('Повреждён порядок объектов');continue}
        if(!validBrush(s))throw new Error('Поврежден инструмент письма');
        if(s.shapeVersion===1&&!validShape(s))throw new Error('Повреждена фигура');
        if(s.type==='text'){if(typeof s.text!=='string'||s.text.length>100000||typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color))throw new Error('Повреждён текст');continue}
        if(!['pen','marker','eraser','stroke-eraser'].includes(s.tool)||!finite(s.width)||s.width<=0||s.width>1000||typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color)||!Array.isArray(s.points)||s.points.some(p=>!isObject(p)||!finite(p.x)||!finite(p.y)||(p.p!==undefined&&(!finite(p.p)||p.p<0||p.p>1))))throw new Error('Повреждена траектория');
        if(s.opacity!==undefined&&(!finite(s.opacity)||s.opacity<0||s.opacity>1))throw new Error('Неверная прозрачность');
        if(s.smoothing!==undefined&&(!finite(s.smoothing)||s.smoothing<0||s.smoothing>100))throw new Error('Неверное сглаживание');
        if(s.tool==='stroke-eraser'&&(!Array.isArray(s.targets)||s.targets.some(target=>!Number.isInteger(target)||target<0||target>=index)))throw new Error('Повреждены данные ластика');
      }}
    }
    return library;
  }
  function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
  async function create(library,preferences){
    validateLibrary(library);const assets=[];const ids=new Set(library.books.flatMap(b=>(b.backgrounds||[]).filter(Boolean).map(bg=>bg.id)));
    for(const id of ImageObjects.assetIds(library))ids.add(id);
    for(const id of ids){const value=await NotepadStore.asset(id);if(!value)throw new Error('Фон отсутствует: резервная копия была бы неполной');assets.push({id,data:await dataURL(value)})}
    return {format:'my-notepad-backup',version:2,createdAt:new Date().toISOString(),library:structuredClone(library),preferences:{...preferences},assets};
  }
  async function parse(text){
    let value;try{value=JSON.parse(text)}catch{throw new Error('Файл не является корректным JSON')}
    const legacy=Array.isArray(value?.books);
    if(!legacy&&(value?.format!=='my-notepad-backup'||value.version!==2))throw new Error('Неизвестный формат резервной копии');
    const library=validateLibrary(legacy?value:value.library),assets=new Map();
    if(!legacy&&!Array.isArray(value.assets))throw new Error('Нет списка файлов');
    for(const entry of legacy?[]:value.assets){
      if(!isObject(entry)||typeof entry.id!=='string'||assets.has(entry.id)||typeof entry.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(entry.data))throw new Error('Повреждён файл фона');
      const blob=await(await fetch(entry.data)).blob();const url=URL.createObjectURL(blob);
      try{const img=new Image();img.src=url;await img.decode()}catch{throw new Error('Фон не является изображением')}finally{URL.revokeObjectURL(url)}
      assets.set(entry.id,blob);
    }
    for(const b of library.books)for(const bg of b.backgrounds||[])if(bg&&!assets.has(bg.id))throw new Error('В копии не хватает фона документа');
    for(const id of ImageObjects.assetIds(library))if(!assets.has(id))throw new Error('В копии не хватает изображения');
    return {library,assets};
  }
  async function merge(current,backup){
    const assets=[],idMap=new Map();for(const [id,blob]of backup.assets){const newId=uid();idMap.set(id,newId);assets.push([newId,blob])}
    const books=structuredClone(backup.library.books);for(const b of books){b.id=uid();b.name+=' (копия)';for(const bg of b.backgrounds||[])if(bg)bg.id=idMap.get(bg.id)}
    for(const b of books)for(const items of b.pages)for(const s of items)for(const v of [s,s.value])if(v?.type==='image-object')v.asset=idMap.get(v.asset);
    const next={...current,books:[...current.books,...books],selected:books[0].id};
    await NotepadStore.write(next,assets);return next;
  }
  return {validateLibrary,create,parse,merge};
})();
