async function runBrushTests(check) {
  const savedBook=book,savedPage=page,savedPreferences={...preferences};
  const gallery={id:'brush-gallery',name:'Ручки и кисти 2.1',paper:'blank',pages:[]};data.books.push(gallery);data.selected=gallery.id;
  const signatures=new Set();
  for(const kind of Object.keys(Brushes.labels)){
    const sample=document.createElement('canvas');sample.width=300;sample.height=100;const context=sample.getContext('2d'),fixture={tool:kind==='marker'?'marker':'pen',penType:kind,width:kind==='marker'?30:8,color:'#222222',points:[{x:20,y:50,p:.5},{x:280,y:50,p:.5}],seed:123,pressure:false};Brushes.render(context,fixture);const signature=sample.toDataURL();signatures.add(signature);
    if(kind==='dashed')check('dashed pen has visible gaps',context.getImageData(30,50,1,1).data[3]>0&&context.getImageData(52,50,1,1).data[3]===0);
    if(kind==='pencil'){context.clearRect(0,0,300,100);Brushes.render(context,fixture);check('pencil grain is deterministic',sample.toDataURL()===signature);context.clearRect(0,0,300,100);Brushes.render(context,{...fixture,seed:124});check('pencil seed controls texture',sample.toDataURL()!==signature)}
    gallery.pages.push([]);page=gallery.pages.length-1;render();PageView.fit();document.querySelector('[data-tool=pen]').click();check('brush menu opens from primary tool '+kind,$('brushDialog').open);$('brushOptions').querySelector('[data-brush='+kind+']').click();
    for(const [id,value]of [['brushWidth','8'],['brushOpacity','100'],['brushSmoothing','0']]){$(id).value=value;$(id).dispatchEvent(new Event('input'))}$('useBrush').click();
    const r=canvas.getBoundingClientRect();function pointer(type,id,x,y,extra={}){canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:r.left+x/W*r.width,clientY:r.top+y/H*r.height,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true,pressure:.95,...extra}))}
    pointer('pointerdown',950,100,100);pointer('pointermove',950,140,110);pointer('pointermove',950,180,100);pointer('pointerup',950,180,100);
    const stroke=gallery.pages[page][0];check('brush records editable stroke '+kind,stroke.brushVersion===1&&stroke.penType===kind&&stroke.points.length===3&&!stroke.pressure&&stroke.points.every(p=>p.p===.5&&!p.pressureValid));
    $('undo').click();check('brush undo '+kind,gallery.pages[page].length===0);$('redo').click();check('brush redo '+kind,gallery.pages[page][0]===stroke);
    if(kind==='ballpoint'){pointer('pointerdown',951,100,150,{pointerType:'pen',pressure:0});pointer('pointermove',951,120,150,{pointerType:'pen',pressure:.9});pointer('pointerup',951,120,150,{pointerType:'pen',pressure:0});const pressureStroke=gallery.pages[page][1];check('real pressure can start after pointerdown',pressureStroke.pressure&&!pressureStroke.points[0].pressureValid&&pressureStroke.points[1].pressureValid&&Math.abs(pressureStroke.points[1].p-.9)<1e-6)}
  }
  $('penType').value='pencil';$('penType').dispatchEvent(new Event('input'));Editor.choose('marker');check('marker shortcut selects the marker style',preferences.penType==='marker'&&tool==='marker');Editor.choose('pen');check('pen shortcut restores the previous pen',preferences.penType==='pencil'&&tool==='pen');
  $('penType').value='marker';$('penType').dispatchEvent(new Event('input'));$('savePreset').click();$('penType').value='ballpoint';$('penType').dispatchEvent(new Event('input'));$('penPresets').lastElementChild.click();check('marker preset restores marker mode',preferences.penType==='marker'&&tool==='marker');
  check('all brush styles have distinct rendered output',signatures.size===Object.keys(Brushes.labels).length);
  const exports=[];for(let i=0;i<gallery.pages.length;i++){const image=await Documents.compose(gallery,i),pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;let ink=false;for(let j=0;j<pixels.length;j+=4)if(pixels[j]<252){ink=true;break}check('brush exported page '+i,ink);exports.push(image.toDataURL())}
  localStorage.setItem('test-brushes-export',JSON.stringify(exports));await save();check('brush metadata saved',(await NotepadStore.read()).books.find(b=>b.id===gallery.id).pages.every(p=>p[0].brushVersion===1));
  const parsed=await Backups.parse(JSON.stringify(await Backups.create({books:[gallery],selected:gallery.id},preferences)));check('brushes survive backup round trip',JSON.stringify(parsed.library.books[0].pages)===JSON.stringify(gallery.pages));
  preferences={...savedPreferences};for(const id of ['penType','color','width','opacity','smoothing'])$(id).value=preferences[id];syncCorrection();data.selected=savedBook.id;page=savedPage;Editor.choose('pen');render();PageView.fit();await save();
}
