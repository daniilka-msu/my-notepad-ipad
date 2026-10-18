const TextBlocks = (() => {
  const fonts = {
    'Times New Roman':'"Times New Roman", Times, serif',
    Arial:'Arial, sans-serif', Georgia:'Georgia, serif',
    Helvetica:'Helvetica, Arial, sans-serif'
  };
  const measure = document.createElement('canvas').getContext('2d');
  const font = s => `${s.italic?'italic ':''}${s.bold?'bold ':''}${s.size}px ${fonts[s.font]}`;
  function layout(s) {
    measure.font=font(s);
    const lines=[];
    for(const paragraph of s.text.replace(/\r\n?/g,'\n').split('\n')) {
      let line='';
      for(const word of paragraph.split(/(\s+)/)) {
        if(line&&measure.measureText(line+word).width>s.width){lines.push(line.trimEnd());line=''}
        for(const char of word){if(line&&measure.measureText(line+char).width>s.width){lines.push(line);line=''}line+=char}
      }
      lines.push(line);
    }
    return {lines,height:Math.max(1,lines.length)*s.size*1.35};
  }
  function render(context,s) {
    context.save();const metrics=layout(s);if(s.background){context.fillStyle=s.background;context.fillRect(s.x,s.y,s.width,metrics.height)}context.font=font(s);context.fillStyle=s.color;context.textBaseline='top';context.textAlign=s.align;
    const x=s.x+(s.align==='center'?s.width/2:s.align==='right'?s.width:0);
    metrics.lines.forEach((line,i)=>{const y=s.y+i*s.size*1.35;context.fillText(line,x,y);if(s.underline){const w=context.measureText(line).width,left=x-(s.align==='center'?w/2:s.align==='right'?w:0);context.fillRect(left,y+s.size*1.05,w,Math.max(1,s.size/18))}});context.restore();
  }
  function valid(s) {
    return s?.type==='text-block'&&typeof s.text==='string'&&s.text.length<=10000&&Object.hasOwn(fonts,s.font)&&
      ['x','y','width','size'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k]))&&Math.abs(s.x)<1e6&&Math.abs(s.y)<1e6&&s.width>=40&&s.width<=794&&s.size>=8&&s.size<=120&&
      (s.underline===undefined||typeof s.underline==='boolean')&&(s.background===undefined||s.background===null||/^#[0-9a-f]{6}$/i.test(s.background))&&typeof s.bold==='boolean'&&typeof s.italic==='boolean'&&['left','center','right'].includes(s.align)&&/^#[0-9a-f]{6}$/i.test(s.color);
  }
  return {fonts,font,layout,render,valid};
})();
