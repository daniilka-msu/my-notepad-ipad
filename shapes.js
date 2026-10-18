const Shapes = (() => {
  const kinds = ['line','rect','circle','ellipse','triangle','diamond','pentagon','hexagon','arrow','doubleArrow','curve','dashed'];
  const closed = new Set(['rect','circle','ellipse','triangle','diamond','pentagon','hexagon']);
  let preview = null;
  function points(kind, start, end, notebook) {
    const scale = Paper.geometry(notebook).outputHeight / 1123;
    const a = {x:start.x,y:start.y*scale}, b = {x:end.x,y:end.y*scale};
    if (kind === 'circle') {
      const side = Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
      b.x=a.x+(b.x<a.x?-side:side);b.y=a.y+(b.y<a.y?-side:side);
    }
    const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2;
    let result;
    if (kind==='rect') result=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];
    else if (kind==='circle'||kind==='ellipse') result=Array.from({length:97},(_,i)=>({x:cx+rx*Math.cos(i*Math.PI/48),y:cy+ry*Math.sin(i*Math.PI/48)}));
    else if (['triangle','diamond','pentagon','hexagon'].includes(kind)) {
      const n={triangle:3,diamond:4,pentagon:5,hexagon:6}[kind];
      result=Array.from({length:n+1},(_,i)=>({x:cx+rx*Math.cos(-Math.PI/2+i*2*Math.PI/n),y:cy+ry*Math.sin(-Math.PI/2+i*2*Math.PI/n)}));
    } else if (kind==='arrow'||kind==='doubleArrow') {
      const angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.min(22,Math.hypot(b.x-a.x,b.y-a.y)*.3);
      const wing=(p,t)=>({x:p.x-length*Math.cos(t),y:p.y-length*Math.sin(t)});
      result=[a,b,wing(b,angle-.5),b,wing(b,angle+.5)];
      if(kind==='doubleArrow')result.push(b,a,wing(a,angle+Math.PI-.5),a,wing(a,angle+Math.PI+.5));
    } else if (kind==='curve') {
      const control={x:cx-(b.y-a.y)*.4,y:cy+(b.x-a.x)*.4};
      result=Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return {x:u*u*a.x+2*u*t*control.x+t*t*b.x,y:u*u*a.y+2*u*t*control.y+t*t*b.y}});
    } else result=[a,b];
    return result.map(p=>({x:p.x,y:p.y/scale,p:.5}));
  }
  function resolve(items, includePreview=true) {
    const result=items.map(s=>s.type==='shape-edit'?null:s);
    for(const entry of items)if(entry.type==='shape-edit')result[entry.target]=entry.value;
    if(includePreview&&preview?.items===items)result[preview.index]=preview.value;
    return result;
  }
  function render(context, shape, notebook = {}) {
    const scale=Paper.geometry(notebook).outputHeight/1123;
    context.save();context.scale(1,1/scale);context.globalAlpha=shape.opacity??1;context.strokeStyle=shape.color;context.fillStyle=shape.fill||'transparent';context.lineWidth=shape.width;context.lineCap='round';context.lineJoin='round';
    if(shape.shape==='dashed')context.setLineDash([shape.width*3,shape.width*2]);
    context.beginPath();for(const [i,p]of shape.points.entries()){if(i)context.lineTo(p.x,p.y*scale);else context.moveTo(p.x,p.y*scale)}
    if(closed.has(shape.shape)){context.closePath();if(shape.fill)context.fill()}context.stroke();context.restore();
  }
  function bounds(shape) {
    return {x:Math.min(...shape.points.map(p=>p.x)),y:Math.min(...shape.points.map(p=>p.y)),right:Math.max(...shape.points.map(p=>p.x)),bottom:Math.max(...shape.points.map(p=>p.y))};
  }
  function hit(shape,p,tolerance) {
    if(closed.has(shape.shape)) {
      let inside=false;
      for(let i=0,j=shape.points.length-1;i<shape.points.length;j=i++){
        const a=shape.points[i],b=shape.points[j];
        if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      }
      if(inside)return true;
    }
    return shape.points.some((b,i)=>pointSegmentDistance(p,shape.points[Math.max(0,i-1)],b)<tolerance+shape.width/2);
  }
  return {kinds,closed,points,resolve,render,bounds,hit,setPreview(value){preview=value},hasPreview(items){return preview?.items===items}};
})();
