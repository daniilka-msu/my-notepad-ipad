const PageActions=(()=>{
  const actions=document.createElement('div');actions.id='pageActions';actions.innerHTML='<button id="duplicatePage">Дублировать страницу</button><label>Переместить на позицию <input id="movePageNumber" type="number" min="1" value="1" aria-label="Новая позиция страницы"></label><button id="movePage">Переместить</button><button id="undoPages" disabled>Отменить действие со страницами</button><button id="redoPages" disabled>Повторить действие со страницами</button>';$('jumpForm').after(actions);
  const history=new WeakMap();
  function state(){
    let h=history.get(book);if(!h||h.expected.length!==book.pages.length||h.expected.some((items,i)=>items!==book.pages[i])){h={undo:[],redo:[],expected:[...book.pages]};history.set(book,h)}return h;
  }
  function snapshot(){return {pages:[...book.pages],backgrounds:book.backgrounds?[...book.backgrounds]:undefined,page}}
  function refresh(){const h=state();$('undoPages').disabled=!h.undo.length;$('redoPages').disabled=!h.redo.length;$('movePageNumber').max=book.pages.length;$('movePageNumber').value=page+1}
  function changed(){history.get(book).expected=[...book.pages];redo=[];render();PageView.layout();refresh();if($('pagesDialog').open){$('pagesDialog').close();$('showPages').click()}}
  function remember(){finish();const h=state();h.undo.push(snapshot());if(h.undo.length>20)h.undo.shift();h.redo=[]}
  function duplicate(){remember();book.pages.splice(page+1,0,structuredClone(book.pages[page]));if(book.backgrounds)book.backgrounds.splice(page+1,0,book.backgrounds[page]?{...book.backgrounds[page]}:null);page++;changed()}
  function move(target){if(!Number.isInteger(target)||target<0||target>=book.pages.length||target===page)return;remember();const [items]=book.pages.splice(page,1);book.pages.splice(target,0,items);if(book.backgrounds){const [bg]=book.backgrounds.splice(page,1);book.backgrounds.splice(target,0,bg)}page=target;changed()}
  function restore(from,to){finish();const h=state();if(!h[from].length)return;h[to].push(snapshot());const value=h[from].pop();book.pages=value.pages;if(value.backgrounds)book.backgrounds=value.backgrounds;page=value.page;changed()}
  $('duplicatePage').onclick=duplicate;$('movePage').onclick=()=>move(Number($('movePageNumber').value)-1);$('undoPages').onclick=()=>restore('undo','redo');$('redoPages').onclick=()=>restore('redo','undo');$('showPages').addEventListener('click',refresh);
  const png=document.createElement('button');png.id='exportPng';png.textContent='PNG';png.title='Скачать текущую страницу как PNG';$('exportPdf').after(png);
  function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  async function pngBlob(){finish();const target=await Documents.compose(book,page);return new Promise((resolve,reject)=>target.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось создать PNG')),'image/png'))}
  png.onclick=async()=>{png.disabled=true;const name=book.name.replace(/[<>:"/\\|?*]/g,'_')+'-'+(page+1)+'.png';try{download(await pngBlob(),name);status('PNG готов и передан браузеру для сохранения')}catch(error){status('Экспорт не выполнен: '+error.message)}finally{png.disabled=false}};
  function status(text){$('operationStatus').hidden=false;$('operationStatus').textContent=text}
  $('retrySave').onclick=async()=>{try{if(!storageReady){
      await NotepadStore.open();const stored=await NotepadStore.read();
      if(stored?.books?.length){Backups.validateLibrary(stored);const recovered=structuredClone(data);for(const b of recovered.books){const wasSelected=b.id===recovered.selected;b.id=uid();b.name+=' (восстановлено)';if(wasSelected)recovered.selected=b.id}data={...stored,books:[...stored.books,...recovered.books],selected:recovered.selected};page=0;redo=[]}
      storageReady=true;render();
    }await save()}catch{status('Сохранение не выполнено. Скачайте резервную копию.')}};
  $('emergencyBackup').onclick=()=>$('exportBackup').click();
  window.addEventListener('beforeunload',e=>{if(unsaved||drawing){finish();e.preventDefault();e.returnValue=''}});
  document.addEventListener('keydown',e=>{
    if(e.target.closest?.('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
    if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click()}else if(e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click()}else if(e.key==='0'){e.preventDefault();PageView.fit()}return}
    const keys={p:'pen',h:'hand',e:'eraser',m:'marker'};if(keys[e.key.toLowerCase()]){e.preventDefault();Editor.choose(keys[e.key.toLowerCase()])}
    if(e.key==='ArrowLeft')$('prev').click();if(e.key==='ArrowRight')$('next').click();if(e.key.toLowerCase()==='f')$('focusMode').click();
  });
  return {duplicate,move,pngBlob,refresh};
})();
