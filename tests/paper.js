async function runPaperTests(check) {
  const originalBook=book,originalPage=page;
  const specimen={id:'paper-regression',name:'Бумага',paper:'grid',gridMm:5,pages:[[],[]]};
  data.books.push(specimen);data.selected=specimen.id;page=0;render();
  const near=(a,b)=>Math.abs(a-b)<.02;
  const step=Paper.ruling(specimen),g=Paper.geometry(specimen);
  check('5 mm grid has 42 columns on A4',near(g.width/step.x,42));
  specimen.pages[0].push({tool:'pen',color:'#222222',width:2,points:[{x:step.x*2,y:step.y*2},{x:step.x*3,y:step.y*3}]});render();
  const savedInk=JSON.stringify(specimen.pages),ruling=$('paperRuling');
  const baseline=ruling.toDataURL();
  const scan=ruling.getContext('2d').getImageData(0,Math.round(step.y),ruling.width,1).data;let runs=0,inside=false;
  for(let x=0;x<ruling.width;x++){const marked=scan[x*4+3]>30;if(marked&&!inside)runs++;inside=marked}
  check('rendered A4 grid actually contains 42 vertical lines',runs===42);
  render();check('ordinary ink render reuses paper backing store',ruling.toDataURL()===baseline);

  function aligned(){const r=canvas.getBoundingClientRect(),p={x:step.x*2,y:step.y*2};const screen={clientX:r.left+p.x/g.width*r.width,clientY:r.top+p.y/g.height*r.height};const mapped=pos(screen);const paper=$('paperRuling').getBoundingClientRect();return near(mapped.x,p.x)&&near(mapped.y,p.y)&&near((screen.clientX-paper.left)/paper.width*g.width/step.x,2)&&near((screen.clientY-paper.top)/paper.height*g.height/step.y,2)}
  for(const zoom of [.5,1,1.7,3]){PageView.setZoom(zoom);check('grid and ink share coordinates at '+zoom,aligned()&&near(ruling.getBoundingClientRect().width,canvas.getBoundingClientRect().width)&&ruling.toDataURL()===baseline)}
  $('zoomOut').click();$('zoomIn').click();check('zoom buttons do not redraw grid',aligned()&&ruling.toDataURL()===baseline);PageView.fit();check('fit preserves grid alignment',aligned());
  const emit=(type,id,x,y)=>canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));
  emit('pointerdown',810,200,200);emit('pointerdown',811,260,200);emit('pointermove',811,300,200);emit('pointerup',810,200,200);emit('pointerup',811,300,200);check('pinch preserves ruling and ink',aligned()&&ruling.toDataURL()===baseline&&JSON.stringify(specimen.pages)===savedInk);
  Editor.choose('hand');emit('pointerdown',812,220,220);emit('pointermove',812,180,180);emit('pointerup',812,180,180);check('hand preserves grid coordinates',aligned()&&JSON.stringify(specimen.pages)===savedInk);Editor.choose('pen');
  $('next').click();$('prev').click();check('page navigation preserves ruling',aligned()&&ruling.toDataURL()===baseline);
  for(const size of [5,7,10]){$('gridSize').value=String(size);$('gridSize').dispatchEvent(new Event('change'));check('explicit grid size '+size+' mm',specimen.gridMm===size&&near(Paper.ruling(specimen).x,size*794/210)&&JSON.stringify(specimen.pages)===savedInk)}
  for(const format of ['a4','a5','square']){
    specimen.pageSize=format;specimen.gridMm=5;render();PageView.layout();const geometry=Paper.geometry(specimen),r=canvas.getBoundingClientRect();
    check('screen geometry matches export '+format,near(r.width/r.height,geometry.outputWidth/geometry.outputHeight));
    const image=await Documents.compose(specimen,1),expected=document.createElement('canvas');expected.width=geometry.outputWidth;expected.height=geometry.outputHeight;const c=expected.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,expected.width,expected.height);c.scale(1,geometry.outputHeight/geometry.height);Paper.draw(c,specimen);
    check('export uses identical ruling '+format,image.toDataURL()===expected.toDataURL());
    const cell=Paper.ruling(specimen);check('physical cells remain square '+format,near(cell.x,cell.y*geometry.outputHeight/geometry.height));
  }
  for(const paper of ['lines','dots','blank']){specimen.paper=paper;render();const image=$('paperRuling').toDataURL();PageView.setZoom(2.5);check(paper+' ruling scales without regeneration',$('paperRuling').toDataURL()===image);}
  specimen.paper='grid';
  delete specimen.pageSize;delete specimen.gridMm;render();check('legacy grid remains 24 document units',Paper.ruling(specimen).x===24&&!('gridMm'in specimen));
  const backup=await Backups.create({books:[specimen],selected:specimen.id},preferences);check('backup retains legacy paper unchanged',!('gridMm'in (await Backups.parse(JSON.stringify(backup))).library.books[0]));
  specimen.gridMm=7;await save();check('grid size survives IndexedDB',(await NotepadStore.read()).books.find(b=>b.id===specimen.id).gridMm===7);
  const configured=await Backups.parse(JSON.stringify(await Backups.create({books:[specimen],selected:specimen.id},preferences)));check('backup retains configured grid',configured.library.books[0].gridMm===7);
  let bad=false;try{Backups.validateLibrary({books:[{...specimen,gridMm:6}],selected:specimen.id})}catch{bad=true}check('invalid grid setting rejected',bad);
  $('newBook').click();$('notebookName').value='Новая тетрадь';$('notebookForm').requestSubmit();for(let i=0;i<100&&$('notebookDialog').open;i++)await new Promise(r=>setTimeout(r,10));check('new notebooks default to 5 mm',book.gridMm===5);data.books=data.books.filter(b=>b!==book);
  data.books=data.books.filter(b=>b!==specimen);data.selected=originalBook.id;page=originalPage;render();PageView.fit();await save();
}
