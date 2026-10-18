const NotepadIcons=(()=>{
  const paths={
    text:'M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3',
    menu:'M4 6h16M4 12h16M4 18h16',
    notebook:'M6 3h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18M12 8h4M12 12h4',
    pen:'m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-4-4L5 15l-1 5Z',
    marker:'m14 3 7 7-8 8-7-7 8-8ZM6 11l-3 5 5 5 5-3M3 21h7',
    eraser:'m14 3 7 7-10 10H6l-4-4L14 3Zm-7 8 8 8M11 20h10',
    hand:'M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v7M17 13V9a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7-3 0-5-2-7-5l-3-4a1.5 1.5 0 0 1 2-2l3 3',
    shapes:'M3 3h9v9H3zM21 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    pages:'M4 3h7v8H4zM15 3h5v8h-5zM4 15h7v6H4zM15 15h5v6h-5z',
    plus:'M12 5v14M5 12h14',minus:'M5 12h14',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
    undo:'M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2',redo:'m16 5 5 5-5 5M21 10H11a7 7 0 0 0-7 7v2',
    close:'m6 6 12 12M6 18 18 6',more:'M5 12h.01M12 12h.01M19 12h.01',
    upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',download:'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    image:'M3 3h18v18H3zM3 17l6-6 6 6 3-3 3 3M16 7h.01',
    focus:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    exitFocus:'M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5',
    fit:'M4 4v16M20 4v16M9 8l-4 4 4 4m6-8 4 4-4 4M5 12h14',
    left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',
    sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
    check:'m5 12 4 4L19 6',lock:'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
    copy:'M8 8h13v13H8zM16 8V3H3v13h5',move:'M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
    paper:'M6 3h9l5 5v13H6zM15 3v6h5M9 13h8M9 17h8'
  };
  function create(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.notebook);svg.append(path);return svg}
  return {create};
})();
