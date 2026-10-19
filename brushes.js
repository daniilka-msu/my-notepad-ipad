const Brushes = (() => {
  const labels={regular:'Обычная ручка',ballpoint:'Шариковая ручка',fountain:'Перьевая ручка',pencil:'Карандаш',marker:'Маркер',brush:'Кисть',calligraphy:'Каллиграфическое перо',dashed:'Пунктирная ручка',gel:'Гелевая ручка'};
  const descriptions={regular:'Ровная круглая линия.',ballpoint:'Тонкий округлый штрих с умеренной реакцией на давление.',fountain:'Ширина зависит от направления движения и давления пера.',pencil:'Зернистая текстура графита; рисунок зерна сохраняется.',marker:'Широкий скошенный след с прозрачностью маркера.',brush:'Мягкий край и плавное сужение концов штриха.',calligraphy:'Плоское перо под фиксированным углом 55°.',dashed:'Штрихи и промежутки вдоль траектории без соединения отдельных касаний.',gel:'Плотная округлая линия шире обычной ручки.'};
  const sprites=new Map();
  function samples(points,width) {
    const distances=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
    const total=distances.reduce((a,b)=>a+b,0),spacing=Math.max(width?Math.max(.08,Math.min(.7,width*.12)):.7,total/12000),result=[];
    if(!total)return [{...points[0],angle:0,progress:.5}];
    let walked=0,next=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],d=distances[i-1];if(!d)continue;
      while(next<=walked+d){const t=(next-walked)/d;result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,p:(a.p??.5)+((b.p??.5)-(a.p??.5))*t,pressureValid:a.pressureValid!==false&&b.pressureValid!==false,angle:Math.atan2(b.y-a.y,b.x-a.x),progress:next/total});next+=spacing}walked+=d;
    }
    result.push({...points.at(-1),angle:result.at(-1)?.angle||0,progress:1});return result;
  }
  function softSprite(color){
    if(sprites.has(color))return sprites.get(color);const image=document.createElement('canvas');image.width=image.height=64;const c=image.getContext('2d'),gradient=c.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,color);gradient.addColorStop(.65,color);gradient.addColorStop(1,'transparent');c.fillStyle=gradient;c.fillRect(0,0,64,64);if(sprites.size>=8)sprites.delete(sprites.keys().next().value);sprites.set(color,image);return image;
  }
  function render(c,s){
    if(!s.points?.length)return;const kind=labels[s.penType]?s.penType:'regular',width=s.width;
    c.save();c.fillStyle=c.strokeStyle=s.color;c.lineCap='round';c.lineJoin='round';
    if(kind==='dashed'){
      c.lineWidth=width;c.setLineDash([width*3,width*2]);c.beginPath();s.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(s.points.length===1)c.lineTo(s.points[0].x+.01,s.points[0].y);c.stroke();c.restore();return;
    }
    let seed=(s.seed??17)|0;function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296}
    const path=samples(s.points,s.tightSampling?s.width:0);
    for(const p of path){
      const credible=s.pressure&&p.pressureValid!==false&&Number.isFinite(p.p);
      const pressure=credible?Math.min(1,Math.max(0,p.p)):.5;
      const factor=credible ? .3+pressure*1.4 : 1;
      if(kind==='pencil'){
        c.globalAlpha=.45;const radius=width*.5*factor;
        for(let i=0;i<4;i++){const angle=random()*Math.PI*2,r=Math.sqrt(random())*radius;c.beginPath();c.arc(p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r,.18+random()*.4,0,Math.PI*2);c.fill()}
      }else if(kind==='marker'){
        c.save();c.translate(p.x,p.y);c.rotate(-.35);c.fillRect(-width/2,-width*.17,width,width*.34);c.restore();
      }else if(kind==='calligraphy'){
        c.beginPath();c.ellipse(p.x,p.y,Math.max(.2,width*.7*factor),Math.max(.2,width*.12*factor),55*Math.PI/180,0,Math.PI*2);c.fill();
      }else if(kind==='brush'){
        const taper=.35+.65*Math.pow(Math.sin(Math.PI*p.progress),.3),radius=Math.max(.3,width*factor*taper);c.drawImage(softSprite(s.color),p.x-radius,p.y-radius,radius*2,radius*2);
      }else{
        const thickness=kind==='ballpoint'?width*.8*(credible ? .8+pressure*.4 : 1):kind==='fountain'?width*factor*(.3+.7*Math.abs(Math.sin(p.angle-Math.PI/6))):width*factor*(kind==='gel'?1.15:1);
        c.beginPath();c.arc(p.x,p.y,Math.max(.2,thickness/2),0,Math.PI*2);c.fill();
      }
    }
    c.restore();
  }
  function preview(canvas,style,filter){
    const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const c=layer.getContext('2d'),points=[];
    for(let x=16;x<canvas.width-16;x+=3){const point={x,y:canvas.height/2+canvas.height*.2*Math.sin(x/32)+2*Math.sin(x*1.7),p:.5};points.push(filter?filter(point,points.at(-1)):point)}
    render(c,{...style,points,pressure:false,seed:17});const target=canvas.getContext('2d');target.clearRect(0,0,canvas.width,canvas.height);target.save();target.globalAlpha=(style.opacity??1)*(style.tool==='marker'?.28:1);target.drawImage(layer,0,0);target.restore();
  }
  return {labels,descriptions,render,preview};
})();
