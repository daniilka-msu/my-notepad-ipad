const Paper = (() => {
  const width = 794, height = 1123;
  function geometry(notebook) {
    const outputHeight = notebook.pageSize === 'square' ? width : notebook.pageSize === 'a5' ? Math.round(width * 794 / 559) : height;
    return {width, height, outputWidth: width, outputHeight, widthMm: notebook.pageSize === 'a5' ? 148 : 210};
  }
  function ruling(notebook) {
    const g = geometry(notebook);
    const step = notebook.paper === 'grid' && [5, 7, 10].includes(notebook.gridMm) ? notebook.gridMm * width / g.widthMm : notebook.paper === 'lines' ? 32 : 24;
    return {x: step, y: step * height / g.outputHeight, dotX: step / 2, dotY: step * height / g.outputHeight / 2};
  }
  function draw(context, notebook) {
    if (notebook.paper === 'blank') return;
    const step = ruling(notebook);
    context.save();context.strokeStyle = ['gray', 'black'].includes(notebook.paperColor) ? '#596273' : '#dce7f6';context.fillStyle = context.strokeStyle;
    context.lineWidth = 1;
    if (notebook.paper === 'dots') {
      for (let x = step.dotX; x < width; x += step.x) for (let y = step.dotY; y < height; y += step.y) {
        context.beginPath();context.ellipse(x,y,1,height / geometry(notebook).outputHeight,0,0,Math.PI * 2);context.fill();
      }
    } else {
      for (let y = 0; y < height; y += step.y) {context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke()}
      if (notebook.paper === 'grid') for (let x = 0; x < width; x += step.x) {context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke()}
    }
    context.restore();
  }
  function apply(sheet, notebook, index) {
    const g = geometry(notebook), step = ruling(notebook);
    let background = document.getElementById('paperRuling');
    if (!background) {background=document.createElement('canvas');background.id='paperRuling';background.setAttribute('aria-hidden','true');sheet.prepend(background)}
    // This backing store is in document coordinates and is independent of screen zoom.
    background.hidden=!!notebook.backgrounds?.[index];
    sheet.dataset.gridX=step.x;sheet.dataset.gridY=step.y;sheet.style.aspectRatio=g.outputWidth+' / '+g.outputHeight;
    const key=JSON.stringify([notebook.paper,notebook.paperColor,notebook.pageSize,notebook.gridMm]);
    if(background.dataset.ruling===key)return;
    background.dataset.ruling=key;
    background.width=width * 2;background.height=height * 2;
    const c=background.getContext('2d');c.scale(2,2);draw(c,notebook);
  }
  return {geometry, ruling, draw, apply};
})();
