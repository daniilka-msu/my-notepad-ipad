async function runInterfaceTests(check){
  const toggle=$('toggleSidebar'),workspace=$('workspace');
  Sidebar.close({restoreFocus:false});PageView.setZoom(2);workspace.scrollLeft=120;workspace.scrollTop=240;
  const before={zoom:PageView.zoom,x:workspace.scrollLeft,y:workspace.scrollTop,width:workspace.clientWidth,data:JSON.stringify(data)};
  toggle.focus();toggle.click();
  check('library opens with one state',Sidebar.open&&!$('sidebar').hidden&&!$('sidebar').inert&&!$('sidebarBackdrop').hidden&&toggle.getAttribute('aria-expanded')==='true'&&$('sidebar').getAttribute('aria-modal')==='true');
  check('library focuses close control without opening keyboard',document.activeElement===$('closeSidebar')&&workspace.inert&&!toggle.inert);
  check('library opening preserves page view',PageView.zoom===before.zoom&&workspace.scrollLeft===before.x&&workspace.scrollTop===before.y&&workspace.clientWidth===before.width);
  toggle.click();check('same toggle closes library',!Sidebar.open&&$('sidebar').hidden&&$('sidebarBackdrop').hidden&&toggle.getAttribute('aria-expanded')==='false'&&!workspace.inert&&document.activeElement===toggle);
  toggle.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));check('Escape closes library and restores focus',!Sidebar.open&&document.activeElement===toggle);
  toggle.click();toggle.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));check('library traps backwards Tab',$('sidebar').contains(document.activeElement));
  $('sidebarBackdrop').click();check('backdrop closes library',!Sidebar.open&&!workspace.inert);
  toggle.click();const currentTool=tool;$('closeSidebar').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'h',bubbles:true}));check('library blocks background shortcuts',tool===currentTool);$('closeSidebar').click();
  check('one primary settings entry',!$('sidebarSettings')&&!!$('openSettings'));check('settings contain all five sections',JSON.stringify([...$('settingsDialog').querySelectorAll('h3')].map(n=>n.textContent))===JSON.stringify(['Письмо','Бумага','Интерфейс','Василий','Данные']));
  $('openSettings').click();$('showSidebar').checked=true;$('showSidebar').dispatchEvent(new Event('change'));check('settings library control shares drawer state',Sidebar.open&&!$('settingsDialog').open&&toggle.getAttribute('aria-expanded')==='true');$('closeSidebar').click();
  toggle.click();$('sidebarPages').click();check('library page action opens real navigator',$('pagesDialog').open&&!Sidebar.open);$('closePages').click();
  toggle.click();$('books').querySelector('.book').click();check('notebook selection closes library',!Sidebar.open&&toggle.getAttribute('aria-expanded')==='false');
  check('library operations preserve notebook contents',JSON.stringify(data)===before.data);
  check('SVG tools have accessible names',[...document.querySelectorAll('.tool')].every(b=>b.querySelector('svg[aria-hidden=true]')&&b.getAttribute('aria-label')));
  check('secondary exports grouped in document menu',$('documentActions').contains($('exportPdf'))&&$('documentActions').contains($('exportPng'))&&$('documentActions').contains($('importFile')));
  $('focusMode').click();check('focus keeps exit control visible',getComputedStyle($('topbar')).display==='none'&&$('focusMode').getClientRects().length>0);$('focusMode').click();
  PageView.fit();
}
