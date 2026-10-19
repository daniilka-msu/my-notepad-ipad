const BrushTools = (() => {
  const dialog=document.createElement('dialog');dialog.id='brushDialog';dialog.setAttribute('aria-labelledby','brushTitle');dialog.innerHTML='<div class="dialog-header"><h2 id="brushTitle">Ручки и кисти</h2><button id="closeBrushes" aria-label="Закрыть ручки и кисти"></button></div><div class="settings-content"><div id="brushOptions"></div><p id="brushDescription" class="hint"></p><canvas id="brushPreview" width="600" height="120" aria-label="Предпросмотр инструмента без давления"></canvas><div id="brushProperties"><label>Цвет<input id="brushColor" type="color"></label><label>Толщина<input id="brushWidth" type="range" min="1" max="25"><output id="brushWidthValue"></output></label><label>Непрозрачность<input id="brushOpacity" type="range" min="5" max="100"><output id="brushOpacityValue"></output></label><label>Сглаживание<input id="brushSmoothing" type="range" min="0" max="85"><output id="brushSmoothingValue"></output></label></div><p class="hint">Давление меняет штрих только при достоверных событиях пера. Палец и ёмкостный стилус работают без давления. Предпросмотр показан без давления.</p><button id="useBrush" class="primary">Писать</button></div>';document.body.append(dialog);Interface.decorate($('closeBrushes'),'close','Закрыть ручки и кисти',true);
  const cards=new Map();
  for(const [kind,label]of Object.entries(Brushes.labels)){
    const button=document.createElement('button');button.type='button';button.dataset.brush=kind;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed','false');const sample=document.createElement('canvas');sample.width=180;sample.height=50;sample.setAttribute('aria-hidden','true');Brushes.preview(sample,{penType:kind,color:'#365ecc',width:kind==='marker'?18:5,tool:kind==='marker'?'marker':'pen',opacity:1});const text=document.createElement('span');text.textContent=label;button.append(sample,text);button.onclick=()=>{$('penType').value=kind;$('penType').dispatchEvent(new Event('input'));sync()};$('brushOptions').append(button);cards.set(kind,button);
  }
  function sync(){
    for(const [kind,button]of cards)button.setAttribute('aria-pressed',String(kind===preferences.penType));$('brushDescription').textContent=Brushes.descriptions[preferences.penType]||Brushes.descriptions.regular;
    for(const [local,source]of [['brushColor','color'],['brushWidth','width'],['brushOpacity','opacity'],['brushSmoothing','smoothing']]){$(local).value=$(source).value;const output=$(local+'Value');if(output)output.textContent=$(source).value+(source==='width'?' px':source==='opacity'?'%':'')}
    Brushes.preview($('brushPreview'),{...preferences,tool:preferences.penType==='marker'?'marker':'pen',width:preferences.width*(preferences.penType==='marker'?5:1),opacity:preferences.opacity/100},(p,last)=>filterPoint(p,last,preferences.smoothing,preferences.stabilization));
  }
  for(const [local,source]of [['brushColor','color'],['brushWidth','width'],['brushOpacity','opacity'],['brushSmoothing','smoothing']])$(local).oninput=()=>{$(source).value=$(local).value;$(source).dispatchEvent(new Event('input'));sync()};
  $('penType').addEventListener('input',()=>{Editor.choose(preferences.penType==='marker'?'marker':'pen')});
  function open(){finish();if(tool==='marker'){$('penType').value='marker';$('penType').dispatchEvent(new Event('input'))}sync();dialog.showModal()}
  document.querySelector('[data-tool=pen]').onclick=()=>{const active=tool==='pen';Editor.choose('pen');if(active||preferences.openToolOptions)open()};
  document.querySelector('[data-tool=marker]').onclick=()=>{const active=tool==='marker';Editor.choose('marker');if(active||preferences.openToolOptions)open()};
  const automatic=document.createElement('label');automatic.innerHTML='<input id="openToolOptions" type="checkbox"> Открывать параметры инструмента при выборе';$('writingSettings').append(automatic);
  $('openToolOptions').checked=preferences.openToolOptions===true;
  $('openToolOptions').onchange=()=>{preferences.openToolOptions=$('openToolOptions').checked;Editor.persist()};
  const eraserDialog=document.createElement('dialog');eraserDialog.id='eraserDialog';eraserDialog.setAttribute('aria-labelledby','eraserTitle');eraserDialog.innerHTML='<div class="dialog-header"><h2 id="eraserTitle">Ластик</h2><button id="closeEraser" aria-label="Закрыть параметры ластика"></button></div><div class="settings-content"><label>Режим<select id="quickEraserMode"><option value="pixel">Стирать участки</option><option value="stroke">Удалять целый штрих</option></select></label><label>Размер ластика<input id="eraserWidth" type="range" min="5" max="125" step="1"><output id="eraserWidthValue"></output></label><p class="hint">Ластик штрихов удаляет только рукописные линии. Фигуры, текст и изображения остаются на месте. Действие можно отменить.</p><button id="useEraser" class="primary">Стирать</button></div>';document.body.append(eraserDialog);Interface.decorate($('closeEraser'),'close','Закрыть параметры ластика',true);
  function syncEraser(){
    $('quickEraserMode').value=preferences.eraserMode;
    $('eraserWidth').value=Number.isFinite(preferences.eraserWidth)?preferences.eraserWidth:15;
    $('eraserWidthValue').textContent=$('eraserWidth').value+' px';
    document.querySelector('[data-tool=eraser]').title=preferences.eraserMode==='stroke'?'Ластик штрихов · повторное нажатие: параметры':'Ластик участков · повторное нажатие: параметры';
  }
  document.querySelector('[data-tool=eraser]').onclick=()=>{const active=tool==='eraser';Editor.choose('eraser');if(active||preferences.openToolOptions){syncEraser();eraserDialog.showModal()}};
  $('quickEraserMode').oninput=()=>{$('eraserMode').value=$('quickEraserMode').value;$('eraserMode').dispatchEvent(new Event('input'));syncEraser()};
  $('eraserMode').addEventListener('input',syncEraser);
  $('eraserWidth').oninput=()=>{preferences.eraserWidth=Number($('eraserWidth').value);Editor.persist();syncEraser()};
  for(const id of ['closeEraser','useEraser'])$(id).onclick=()=>eraserDialog.close();
  eraserDialog.addEventListener('close',()=>document.querySelector('[data-tool=eraser]').focus({preventScroll:true}));
  syncEraser();
  const menuButton=document.createElement('button');menuButton.id='openBrushes';Interface.decorate(menuButton,'pen','Ручки и кисти');$('drawShape').before(menuButton);menuButton.onclick=()=>{$('extraTools').open=false;open()};
  $('closeBrushes').onclick=()=>dialog.close();$('useBrush').onclick=()=>{Editor.choose(preferences.penType==='marker'?'marker':'pen');dialog.close()};dialog.addEventListener('close',()=>{if(!dialog.open)document.querySelector('[data-tool=pen]').focus({preventScroll:true})});
  return {sync,open};
})();
