const Charts = (() => {
  const kinds={bar:'Столбчатая диаграмма',line:'Линейная диаграмма',pie:'Круговая диаграмма',flow:'Блок-схема',axes:'Координатная плоскость',function:'График функции'};
  const palette=['#4567d9','#d45473','#33977d','#c78b28','#885ec0','#267fa6'];
  function valid(s){
    if(s?.type!=='chart-object'||!Object.hasOwn(kinds,s.kind)||!['x','y','width','height'].every(k=>Number.isFinite(s[k])&&Math.abs(s[k])<100000)||s.width<80||s.height<60||typeof s.title!=='string'||s.title.length>100||!/^#[0-9a-f]{6}$/i.test(s.color))return false;
    if(['bar','line','pie'].includes(s.kind))return Array.isArray(s.data)&&s.data.length>0&&s.data.length<=30&&s.data.every(v=>typeof v.label==='string'&&v.label.length<=60&&Number.isFinite(v.value)&&Math.abs(v.value)<=1e9&&(s.kind!=='pie'||v.value>=0))&&(s.kind!=='pie'||s.data.some(v=>v.value>0));
    if(s.kind==='flow')return Array.isArray(s.nodes)&&s.nodes.length>0&&s.nodes.length<=12&&s.nodes.every((n,index)=>['rect','diamond','start'].includes(n.kind)&&typeof n.text==='string'&&n.text.length<=60&&Array.isArray(n.next)&&n.next.length<=12&&n.next.every(i=>Number.isInteger(i)&&i>=0&&i<s.nodes.length&&i!==index));
    if(!['xMin','xMax','yMin','yMax'].every(k=>Number.isFinite(s[k])&&Math.abs(s[k])<=1e6)||s.xMax-s.xMin<.001||s.yMax-s.yMin<.001)return false;
    if(s.kind==='function'){try{MathExpression.compile(s.expression)}catch{return false}}return true;
  }
  function samples(s){const fn=MathExpression.compile(s.expression);return Array.from({length:601},(_,i)=>{const x=s.xMin+(s.xMax-s.xMin)*i/600;return {x,y:fn(x)}})}
  function render(c,s){
    const colors=[s.color,...palette.filter(color=>color!==s.color)];c.save();c.translate(s.x,s.y);c.scale(s.width/540,s.height/360);c.fillStyle='#ffffff';c.fillRect(0,0,540,360);c.strokeStyle='#d4dbe7';c.lineWidth=1;c.strokeRect(.5,.5,539,359);c.fillStyle='#1b2540';c.font='bold 18px Arial, sans-serif';c.textAlign='left';c.textBaseline='middle';c.fillText(s.title||kinds[s.kind],20,24,500);c.font='12px Arial, sans-serif';c.lineWidth=2;
    const plot={x:58,y:60,w:454,h:246};
    function line(x,y,a,b,color='#b6bfd0'){c.strokeStyle=color;c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke()}
    if(s.kind==='pie'){
      const total=s.data.reduce((a,d)=>a+d.value,0);let angle=-Math.PI/2;
      s.data.forEach((d,i)=>{const next=angle+d.value/total*2*Math.PI;c.fillStyle=colors[i%colors.length];c.beginPath();c.moveTo(165,195);c.arc(165,195,112,angle,next);c.closePath();c.fill();angle=next;});
      s.data.forEach((d,i)=>{const column=Math.floor(i/10),row=i%10;c.fillStyle=colors[i%colors.length];c.fillRect(300+column*78,65+row*27,9,9);c.fillStyle='#1b2540';c.fillText(d.label.slice(0,8)+' '+Math.round(d.value/total*100)+'%',313+column*78,70+row*27,65)});
    }else if(s.kind==='bar'||s.kind==='line'){
      let low=Math.min(0,...s.data.map(d=>d.value)),high=Math.max(0,...s.data.map(d=>d.value));if(high===low)high=low+1;const py=y=>plot.y+plot.h-(y-low)/(high-low)*plot.h,step=plot.w/s.data.length;
      for(let i=0;i<=4;i++){const y=low+(high-low)*i/4;line(plot.x,py(y),plot.x+plot.w,py(y),'#e7ebf2');c.fillStyle='#536078';c.fillText(Number(y.toPrecision(3)).toString(),5,py(y),49)}line(plot.x,py(0),plot.x+plot.w,py(0));
      if(s.kind==='line'){c.strokeStyle=s.color;c.beginPath();s.data.forEach((d,i)=>{const x=plot.x+step*(i+.5);if(i)c.lineTo(x,py(d.value));else c.moveTo(x,py(d.value))});c.stroke()}
      s.data.forEach((d,i)=>{const x=plot.x+step*(i+.5);c.fillStyle=s.color;if(s.kind==='bar')c.fillRect(x-step*.32,Math.min(py(0),py(d.value)),step*.64,Math.max(1,Math.abs(py(0)-py(d.value))));else{c.beginPath();c.arc(x,py(d.value),3,0,Math.PI*2);c.fill()}if(s.data.length<=12||i%Math.ceil(s.data.length/12)===0){c.fillStyle='#536078';c.textAlign='center';c.fillText(d.label,x,326,Math.max(25,step-2))}});
    }else if(s.kind==='flow'){
      const positions=s.nodes.map((n,i)=>({x:92+(i%3)*177,y:95+Math.floor(i/3)*70}));
      s.nodes.forEach((n,i)=>n.next.forEach(j=>{const a=positions[i],b=positions[j];if(i===j)return;const dx=b.x-a.x,dy=b.y-a.y,t=Math.min(65/Math.max(.01,Math.abs(dx)),23/Math.max(.01,Math.abs(dy))),u=Math.min(.4,t);const x=b.x-dx*u,y=b.y-dy*u;line(a.x+dx*u,a.y+dy*u,x,y,s.color);const angle=Math.atan2(dy,dx);line(x,y,x-9*Math.cos(angle-.5),y-9*Math.sin(angle-.5),s.color);line(x,y,x-9*Math.cos(angle+.5),y-9*Math.sin(angle+.5),s.color)}));
      s.nodes.forEach((n,i)=>{const p=positions[i];c.fillStyle='#f3f5fc';c.strokeStyle=s.color;c.beginPath();if(n.kind==='diamond'){c.moveTo(p.x,p.y-25);c.lineTo(p.x+70,p.y);c.lineTo(p.x,p.y+25);c.lineTo(p.x-70,p.y);c.closePath()}else if(n.kind==='start'){c.ellipse(p.x,p.y,65,23,0,0,2*Math.PI)}else c.rect(p.x-65,p.y-23,130,46);c.fill();c.stroke();c.fillStyle='#1b2540';c.textAlign='center';c.fillText((i+1)+'. '+n.text,p.x,p.y,110)});
    }else{
      const px=x=>plot.x+(x-s.xMin)/(s.xMax-s.xMin)*plot.w,py=y=>plot.y+plot.h-(y-s.yMin)/(s.yMax-s.yMin)*plot.h;
      for(let i=0;i<=10;i++){const x=s.xMin+(s.xMax-s.xMin)*i/10,y=s.yMin+(s.yMax-s.yMin)*i/10;line(px(x),plot.y,px(x),plot.y+plot.h,'#e7ebf2');line(plot.x,py(y),plot.x+plot.w,py(y),'#e7ebf2');if(i%2===0){c.fillStyle='#536078';c.textAlign='center';c.fillText(Number(x.toPrecision(3)).toString(),px(x),326,60);c.textAlign='right';c.fillText(Number(y.toPrecision(3)).toString(),51,py(y),48)}}
      if(s.xMin<=0&&s.xMax>=0)line(px(0),plot.y,px(0),plot.y+plot.h,'#536078');if(s.yMin<=0&&s.yMax>=0)line(plot.x,py(0),plot.x+plot.w,py(0),'#536078');c.fillStyle='#536078';c.textAlign='right';c.fillText('x',526,326);c.fillText('y',45,48);
      if(s.kind==='function'){c.save();c.beginPath();c.rect(plot.x,plot.y,plot.w,plot.h);c.clip();c.strokeStyle=s.color;c.lineWidth=2;c.beginPath();let previous=null;for(const p of samples(s)){if(!Number.isFinite(p.y)||p.y<s.yMin-(s.yMax-s.yMin)||p.y>s.yMax+(s.yMax-s.yMin)){previous=null;continue}if(previous&&Math.abs(py(p.y)-py(previous.y))<plot.h*.6)c.lineTo(px(p.x),py(p.y));else c.moveTo(px(p.x),py(p.y));previous=p}c.stroke();c.restore()}
    }
    c.restore();
  }
  return {kinds,valid,render,samples};
})();
