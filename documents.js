/* Document backgrounds are immutable; annotations remain editable ink. */
const Documents=(()=>{
  let pdfModule;
  async function pdfjs(){
    if(!pdfModule){pdfModule=import('./vendor/pdfjs/legacy/build/pdf.mjs').then(module=>{module.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/legacy/build/pdf.worker.mjs',location.href).href;return module}).catch(error=>{pdfModule=null;throw error})}
    return pdfModule;
  }
  function blob(canvas,type='image/png'){return new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Не удалось создать изображение')),type))}
  async function image(value){const url=URL.createObjectURL(value);try{const img=new Image();img.src=url;await img.decode();return img}finally{URL.revokeObjectURL(url)}}
  async function importFile(file,onProgress){
    const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
    const imported={id:uid(),name:file.name.replace(/\.[^.]+$/,''),paper:'blank',pages:[],backgrounds:[],sourceName:file.name};
    const entries=[];
    if(isPdf){
      const lib=await pdfjs();
      const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:new URL('./vendor/pdfjs/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',location.href).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',location.href).href,isEvalSupported:false});
      task.onPassword=(update,reason)=>{const password=prompt(reason===1?'Пароль PDF:':'Неверный пароль. Повторите:');if(password===null)task.destroy();else update(password)};
      const pdf=await task.promise;
      try{
        for(let number=1;number<=pdf.numPages;number++){
          onProgress(`Импорт PDF: ${number} / ${pdf.numPages}`);
          const source=await pdf.getPage(number),base=source.getViewport({scale:1});
          const viewport=source.getViewport({scale:Math.min(2,1600/Math.max(base.width,base.height))});
          const target=document.createElement('canvas');target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
          await source.render({canvasContext:target.getContext('2d'),viewport,background:'#ffffff'}).promise;
          const id=uid(),text=(await source.getTextContent()).items.map(item=>item.str||'').join(' ');
          entries.push([id,await blob(target)]);imported.backgrounds.push({id,width:target.width,height:target.height,text});imported.pages.push([]);source.cleanup();target.width=target.height=0;
        }
      }finally{await task.destroy()}
    }else{
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)&&!(/\.(png|jpe?g|webp)$/i.test(file.name)))throw new Error('Выберите PDF, PNG, JPEG или WEBP');
      const source=await image(file),scale=Math.min(1,2400/Math.max(source.naturalWidth,source.naturalHeight));
      const target=document.createElement('canvas');target.width=Math.round(source.naturalWidth*scale);target.height=Math.round(source.naturalHeight*scale);target.getContext('2d').drawImage(source,0,0,target.width,target.height);
      const id=uid();entries.push([id,await blob(target)]);imported.backgrounds.push({id,width:target.width,height:target.height,text:''});imported.pages.push([]);
    }
    return {book:imported,assets:entries};
  }
  async function compose(notebook,index){
    const previousBook=book,previousPage=page;
    const height=notebook.pageSize==='square'?W:notebook.pageSize==='a5'?Math.round(W*794/559):H;
    const target=document.createElement('canvas');target.width=W;target.height=height;const c=target.getContext('2d');
    c.fillStyle=paperColors[notebook.paperColor]||paperColors.white;c.fillRect(0,0,W,height);
    const background=notebook.backgrounds?.[index];
    if(background){const value=await NotepadStore.asset(background.id);if(!value)throw new Error('Фон документа отсутствует. Экспорт остановлен.');const img=await image(value);const scale=Math.min(W/img.naturalWidth,height/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;c.drawImage(img,(W-w)/2,(height-h)/2,w,h)}
    else if(notebook.paper!=='blank'){
      c.strokeStyle=['gray','black'].includes(notebook.paperColor)?'#596273':'#dce7f6';c.fillStyle=c.strokeStyle;c.lineWidth=1;
      const step=notebook.paper==='lines'?32:24;
      if(notebook.paper==='dots'){for(let x=12;x<W;x+=step)for(let y=12;y<height;y+=step){c.beginPath();c.arc(x,y,1,0,Math.PI*2);c.fill()}}
      else {for(let y=0;y<height;y+=step){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}if(notebook.paper==='grid')for(let x=0;x<W;x+=step){c.beginPath();c.moveTo(x,0);c.lineTo(x,height);c.stroke()}}
    }
    try{book=notebook;page=index;paint();c.drawImage(canvas,0,0,W,height)}finally{book=previousBook;page=previousPage;paint()}
    return target;
  }
  return {importFile,compose,pdfjs};
})();
