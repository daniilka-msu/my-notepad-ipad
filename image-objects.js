const ImageObjects = (() => {
  const cache=new Map();
  const assetIds=library=>[...new Set(library.books.flatMap(b=>b.pages.flatMap(items=>items.flatMap(s=>[s,s.value].filter(v=>v?.type==='image-object').map(v=>v.asset)))) )];
  async function load(id) {
    if(cache.has(id))return cache.get(id).promise;
    const entry={image:null,promise:null};cache.set(id,entry);
    entry.promise=(async()=>{const blob=await NotepadStore.asset(id);if(!blob)throw new Error('Изображение отсутствует');const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>24000000)throw new Error('Изображение слишком большое');entry.image=image;return image}finally{URL.revokeObjectURL(url)}})();
    entry.promise.catch(()=>cache.delete(id));return entry.promise;
  }
  async function prepare(items){await Promise.all(Shapes.resolve(items,false).filter(s=>s?.type==='image-object').map(s=>load(s.asset)))}
  function bounds(s,notebook=book){const scale=Paper.geometry(notebook).outputHeight/1123;const rotated=s.rotation%180!==0;const w=rotated?s.height*scale:s.width,h=rotated?s.width/scale:s.height;return {x:s.x+s.width/2-w/2,y:s.y+s.height/2-h/2,width:w,height:h}}
  function render(context,s,notebook){
    const entry=cache.get(s.asset);
    if(!entry?.image){load(s.asset).then(()=>{cachedLength=-1;paint()},()=>{$('saveStatus').textContent='Не удалось загрузить изображение. Проверьте резервную копию.'});return}
    const image=entry.image,scale=Paper.geometry(notebook).outputHeight/1123,crop=s.crop;
    context.save();context.scale(1,1/scale);context.translate(s.x+s.width/2,(s.y+s.height/2)*scale);context.rotate(s.rotation*Math.PI/180);
    context.drawImage(image,crop[0]*image.naturalWidth,crop[1]*image.naturalHeight,crop[2]*image.naturalWidth,crop[3]*image.naturalHeight,-s.width/2,-s.height*scale/2,s.width,s.height*scale);context.restore();
  }
  async function importFile(file){
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Выберите PNG, JPEG или WebP');
    if(!file.size||file.size>12*1024*1024)throw new Error('Размер файла должен быть от 1 байта до 12 МБ');
    const url=URL.createObjectURL(file);let source;
    try{source=new Image();source.src=url;await source.decode();if(source.naturalWidth*source.naturalHeight>40000000)throw new Error('Изображение превышает 40 мегапикселей');
      const ratio=Math.min(1,2048/Math.max(source.naturalWidth,source.naturalHeight)),target=document.createElement('canvas');target.width=Math.max(1,Math.round(source.naturalWidth*ratio));target.height=Math.max(1,Math.round(source.naturalHeight*ratio));target.getContext('2d').drawImage(source,0,0,target.width,target.height);
      const blob=await new Promise((resolve,reject)=>target.toBlob(b=>b?resolve(b):reject(new Error('Не удалось обработать изображение')),'image/png'));
      if(blob.size>8*1024*1024)throw new Error('Обработанное изображение превышает 8 МБ');
      const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.quota-(estimate.usage||0)<blob.size*2+1024*1024)throw new Error('Недостаточно места на устройстве. Экспортируйте резервную копию и освободите место');
      const asset=uid();await NotepadStore.putAssets([[asset,blob]]);await load(asset);
      const scale=Paper.geometry(book).outputHeight/H,width=Math.min(360,target.width),height=width*target.height/target.width/scale;
      const fit=Math.min(1,600/height);return {type:'image-object',asset,x:60,y:80,width:width*fit,height:height*fit,rotation:0,crop:[0,0,1,1]};
    }finally{URL.revokeObjectURL(url)}
  }
  function valid(s){return s?.type==='image-object'&&(s.locked===undefined||typeof s.locked==='boolean')&&typeof s.asset==='string'&&s.asset.length>0&&s.asset.length<200&&['x','y','width','height'].every(k=>Number.isFinite(s[k])&&Math.abs(s[k])<100000)&&s.width>=10&&s.height>=10&&[0,90,180,270].includes(s.rotation)&&Array.isArray(s.crop)&&s.crop.length===4&&s.crop.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&s.crop[2]>.01&&s.crop[3]>.01&&s.crop[0]+s.crop[2]<=1.000001&&s.crop[1]+s.crop[3]<=1.000001}
  return {assetIds,prepare,render,importFile,bounds,valid,retain(ids){const keep=new Set(ids);for(const id of cache.keys())if(!keep.has(id))cache.delete(id)}};
})();
