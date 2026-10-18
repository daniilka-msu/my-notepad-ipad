const Editor=(()=>{
  const libraryControls=document.createElement('div');libraryControls.className='library-controls';libraryControls.innerHTML='<input id="bookSearch" type="search" placeholder="Найти тетрадь…" aria-label="Поиск тетрадей"><select id="bookSort" aria-label="Сортировка тетрадей"><option value="original">По порядку</option><option value="name">По названию</option><option value="newest">Сначала новые</option></select>';$('books').before(libraryControls);
  $('bookSort').value=preferences.bookSort||'original';$('bookSearch').oninput=renderBooks;$('bookSort').onchange=()=>{preferences.bookSort=$('bookSort').value;persist();renderBooks()};
  const extra=document.createElement('details');extra.id='extraTools';extra.innerHTML='<summary>Инструменты и пресеты</summary><div class="tool-options"><div id="favoriteColors" aria-label="Избранные цвета"></div><button id="favoriteColor">+ Текущий цвет</button><div id="favoriteWidths" aria-label="Толщины пера"></div><div id="penPresets"></div><button id="savePreset">Сохранить перо</button><label>Фигура<select id="shapeKind"><option value="line">Линия</option><option value="rect">Прямоугольник</option><option value="ellipse">Круг / эллипс</option><option value="arrow">Стрелка</option></select></label><button id="drawShape" class="tool" data-tool="shape">Фигура</button><label><input id="holdShape" type="checkbox"> Удержание превращает штрих в линию</label></div>';$('toolbar').append(extra);
  $('holdShape').checked=!!preferences.holdShape;$('holdShape').onchange=()=>{preferences.holdShape=$('holdShape').checked;persist()};
  const focus=document.createElement('button');focus.id='focusMode';focus.textContent='Фокус';focus.setAttribute('aria-pressed','false');$('viewControls').append(focus);
  focus.onclick=()=>{finish();const enabled=document.body.classList.toggle('focus-mode');focus.textContent=enabled?'Выйти из фокуса':'Фокус';focus.setAttribute('aria-pressed',String(enabled))};
  const pagesButton=document.createElement('button');pagesButton.id='showPages';pagesButton.textContent='Страницы';$('topbar').insertBefore(pagesButton,$('addPage'));
  const dialog=document.createElement('dialog');dialog.id='pagesDialog';dialog.setAttribute('aria-labelledby','pagesTitle');dialog.innerHTML='<div class="dialog-header"><h2 id="pagesTitle">Страницы</h2><button id="closePages" aria-label="Закрыть страницы">Закрыть</button></div><form id="jumpForm"><label>Перейти к странице <input id="pageNumber" type="number" min="1" required></label><button>Перейти</button></form><div id="pageThumbnails"></div>';document.body.append(dialog);
  let previewToken=0;
  pagesButton.onclick=async()=>{
    finish();const notebook=book,token=++previewToken;$('pageNumber').max=notebook.pages.length;$('pageNumber').value=page+1;$('pageThumbnails').replaceChildren();dialog.showModal();
    for(let i=0;i<notebook.pages.length;i++){
      if(token!==previewToken||!dialog.open)break;
      const button=document.createElement('button');button.className='page-thumb';button.setAttribute('aria-label','Страница '+(i+1));button.setAttribute('aria-current',String(i===page));button.textContent=String(i+1);button.onclick=()=>{go(i);dialog.close()};$('pageThumbnails').append(button);
      try{const image=await Documents.compose(notebook,i);if(token!==previewToken||!dialog.open)break;const thumb=document.createElement('canvas');thumb.width=120;thumb.height=Math.round(120*image.height/image.width);thumb.getContext('2d').drawImage(image,0,0,thumb.width,thumb.height);button.prepend(thumb);image.width=image.height=0}catch{button.title='Не удалось загрузить предпросмотр'}
    }
  };
  $('closePages').onclick=()=>dialog.close();dialog.addEventListener('close',()=>previewToken++);
  $('jumpForm').onsubmit=e=>{e.preventDefault();const n=Number($('pageNumber').value);if(Number.isInteger(n)&&n>=1&&n<=book.pages.length){go(n-1);dialog.close()}};
  function go(index){finish();page=index;redo=[];render();PageView.layout()}
  function persist(){try{localStorage.setItem('notepad-preferences',JSON.stringify(preferences))}catch{}}
  function change(id,value){$(id).value=value;$(id).dispatchEvent(new Event('input'))}
  function favorites(){
    $('favoriteColors').replaceChildren();for(const color of (preferences.favoriteColors||['#222222','#365ecc','#c03943','#23856b'])){const b=document.createElement('button');b.className='color-swatch';b.style.background=color;b.title=color;b.setAttribute('aria-label','Цвет '+color);b.onclick=()=>change('color',color);$('favoriteColors').append(b)}
    $('favoriteWidths').replaceChildren();for(const width of [1,3,5,8]){const b=document.createElement('button');b.textContent=width+' px';b.onclick=()=>change('width',width);$('favoriteWidths').append(b)}
    $('penPresets').replaceChildren();for(const [i,preset]of (preferences.penPresets||[]).entries()){const b=document.createElement('button');b.textContent='Перо '+(i+1);b.style.borderColor=preset.color;b.onclick=()=>{for(const id of ['color','width','penType','opacity'])change(id,preset[id]);choose('pen')};$('penPresets').append(b)}
  }
  $('favoriteColor').onclick=()=>{preferences.favoriteColors=[...new Set([...(preferences.favoriteColors||['#222222','#365ecc','#c03943','#23856b']),$('color').value])].slice(-10);persist();favorites()};
  $('savePreset').onclick=()=>{preferences.penPresets=[...(preferences.penPresets||[]),{color:preferences.color,width:preferences.width,penType:preferences.penType,opacity:preferences.opacity}].slice(-6);persist();favorites()};
  function choose(value){finish();tool=value;document.querySelectorAll('.tool').forEach(b=>{const active=b.dataset.tool===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});canvas.style.cursor=value==='hand'?'grab':'crosshair'}
  document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>choose(b.dataset.tool));
  document.querySelectorAll('button[aria-label]').forEach(b=>b.title=b.getAttribute('aria-label'));
  favorites();renderBooks();return {choose,go,persist};
})();
function shapePoints(kind,a,b){
  if(kind==='rect')return [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a].map(p=>({...p,p:.5}));
  if(kind==='ellipse'){const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2;return Array.from({length:65},(_,i)=>({x:cx+rx*Math.cos(i*Math.PI/32),y:cy+ry*Math.sin(i*Math.PI/32),p:.5}))}
  if(kind==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.min(20,Math.hypot(b.x-a.x,b.y-a.y)*.3);return [a,b,{x:b.x-length*Math.cos(angle-.5),y:b.y-length*Math.sin(angle-.5)},b,{x:b.x-length*Math.cos(angle+.5),y:b.y-length*Math.sin(angle+.5)}].map(p=>({...p,p:.5}))}
  return [a,b].map(p=>({...p,p:.5}));
}
