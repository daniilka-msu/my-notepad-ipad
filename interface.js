const Interface=(()=>{
  const icon=NotepadIcons.create;
  function decorate(element,name,label,iconOnly=false){
    element.replaceChildren(icon(name));const text=document.createElement('span');text.className='button-label';text.textContent=label;element.append(text);element.classList.toggle('icon-only',iconOnly);element.setAttribute('aria-label',label);element.title=label;
  }
  const topbar=$('topbar'),sidebar=$('sidebar');
  const identity=document.createElement('div');identity.className='document-identity';const eyebrow=document.createElement('span');eyebrow.className='document-eyebrow';eyebrow.textContent='MY NOTEPAD';$('bookTitle').before(identity);identity.append(eyebrow,$('bookTitle'));topbar.querySelector('.spacer').remove();
  const actions=document.createElement('div');actions.className='header-actions';topbar.append(actions);actions.append($('showPages'),$('addPage'));
  const docMenu=document.createElement('details');docMenu.id='documentMenu';const summary=document.createElement('summary');summary.id='documentMenuButton';decorate(summary,'more','Действия с тетрадью',true);const documentActions=document.createElement('div');documentActions.id='documentActions';documentActions.className='popover';docMenu.append(summary,documentActions);actions.append(docMenu,$('openSettings'));documentActions.append($('importFile'),$('exportPdf'),$('exportPng'));const menuAddPage=document.createElement('button');menuAddPage.id='menuAddPage';decorate(menuAddPage,'plus','Добавить страницу');menuAddPage.onclick=()=>$('addPage').click();documentActions.prepend(menuAddPage);
  const primaryTools=document.createElement('div');primaryTools.className='tool-group';$('toolbar').prepend(primaryTools);for(const value of ['pen','marker','eraser','hand'])primaryTools.append(document.querySelector('[data-tool='+value+']'));
  const properties=document.createElement('div');properties.className='pen-properties';$('toolbar').append(properties);properties.append($('color').parentElement,$('width').parentElement);
  const widthValue=document.createElement('output');widthValue.id='widthValue';widthValue.textContent=$('width').value+' px';$('width').after(widthValue);$('width').addEventListener('input',()=>widthValue.textContent=$('width').value+' px');
  const history=document.createElement('div');history.className='history-tools';$('toolbar').append(history);history.append($('undo'),$('redo'));
  $('toolbar').append($('extraTools'));
  const paperLabel=document.createElement('label');paperLabel.className='paper-control';paperLabel.append(icon('paper'),document.createTextNode('Бумага'),$('paper'));$('extraTools').querySelector('.tool-options').prepend(paperLabel);$('extraTools').querySelector('.tool-options').append($('clear'));
  const toolSummary=$('extraTools').querySelector('summary');decorate(toolSummary,'shapes','Ещё инструменты',true);
  const statusbar=document.createElement('footer');statusbar.id='statusbar';$('bottom').before(statusbar);statusbar.append($('bottom'),$('viewControls'));
  const subtitle=document.createElement('span');subtitle.className='page-caption';subtitle.textContent='Страница';$('prev').before(subtitle);
  const savePill=document.createElement('span');savePill.className='save-pill';savePill.append(icon('check'),$('saveStatus'));$('viewControls').before(savePill);
  const brand=document.createElement('span');brand.className='brand-mark';brand.append(icon('notebook'));sidebar.querySelector('header').prepend(brand);
  const close=document.createElement('button');close.id='closeSidebar';decorate(close,'close','Закрыть библиотеку',true);sidebar.querySelector('header').append(close);
  const libraryCaption=document.createElement('div');libraryCaption.className='section-caption';libraryCaption.innerHTML='<span>БИБЛИОТЕКА</span><span id="libraryCount"></span>';$('books').before(libraryCaption);
  const sidebarFooter=document.createElement('div');sidebarFooter.className='sidebar-footer';sidebarFooter.innerHTML='<button id="sidebarPages"></button>';sidebar.append(sidebarFooter);sidebarFooter.append($('openAI'));const note=sidebar.querySelector(':scope > .hint');note.replaceChildren(icon('lock'),document.createTextNode('Заметки хранятся на этом устройстве'));sidebar.append(note);
  const decorations=[
    ['toggleSidebar','menu','Библиотека тетрадей',true],['newBook','plus','Новая тетрадь'],['openAI','sparkles','Василий'],['showPages','pages','Страницы'],['addPage','plus','Добавить страницу',true],['importFile','upload','Импорт документов'],['exportPdf','download','Экспорт в PDF'],['exportPng','image','Текущая страница в PNG'],['openSettings','settings','Настройки',true],['undo','undo','Отменить',true],['redo','redo','Повторить',true],['clear','trash','Очистить страницу'],['prev','left','Предыдущая страница',true],['next','right','Следующая страница',true],['zoomIn','plus','Увеличить масштаб',true],['zoomOut','minus','Уменьшить масштаб',true],['fitPage','fit','По ширине'],['focusMode','focus','Режим фокуса',true],['drawShape','shapes','Фигура'],['closeSettings','close','Закрыть настройки',true],['closePages','close','Закрыть страницы',true],['closeAI','close','Закрыть Василия',true],['duplicatePage','copy','Дублировать страницу'],['movePage','move','Переместить'],['sidebarPages','pages','Страницы тетради'],['favoriteColor','plus','Добавить текущий цвет'],['savePreset','pen','Сохранить перо']
  ];for(const [id,name,label,only]of decorations)decorate($(id),name,label,only);
  for(const [value,label]of [['pen','Ручка'],['marker','Маркер'],['eraser','Ластик'],['hand','Рука']])decorate(document.querySelector('[data-tool='+value+']'),value,label);
  let bookCountBeforeCreate=0;$('newBook').addEventListener('click',()=>bookCountBeforeCreate=data.books.length,true);$('newBook').addEventListener('click',()=>{if(data.books.length>bookCountBeforeCreate)Sidebar.close()});
  const backdrop=document.createElement('button');backdrop.id='sidebarBackdrop';backdrop.type='button';backdrop.tabIndex=-1;backdrop.hidden=true;backdrop.setAttribute('aria-label','Закрыть библиотеку');$('app').append(backdrop);
  let open=false,previousFocus=null;const disabled=new Map();
  function setOpen(value,{restoreFocus=true,moveFocus=true}={}){
    value=Boolean(value);if(value===open)return;finish();if(value&&document.body.classList.contains('focus-mode'))$('focusMode').click();
    if(value){previousFocus=document.activeElement;for(const details of [docMenu,$('extraTools')])details.open=false}
    open=value;sidebar.hidden=!open;sidebar.inert=!open;backdrop.hidden=!open;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal',String(open));sidebar.setAttribute('aria-hidden',String(!open));
    $('toggleSidebar').setAttribute('aria-expanded',String(open));$('toggleSidebar').setAttribute('aria-label',open?'Закрыть библиотеку':'Открыть библиотеку');$('toggleSidebar').title=open?'Закрыть библиотеку':'Открыть библиотеку';$('showSidebar').checked=open;preferences.showSidebar=open;
    document.body.classList.toggle('library-open',open);
    if(open){
      for(const node of [...document.querySelector('main').children].filter(n=>n!==topbar).concat([...topbar.querySelectorAll('button,summary')].filter(n=>n!==$('toggleSidebar')))){disabled.set(node,node.inert);node.inert=true}
      if(moveFocus)$('closeSidebar').focus({preventScroll:true});
    }else{
      for(const [node,inert]of disabled)node.inert=inert;disabled.clear();
      if(restoreFocus){const target=previousFocus?.isConnected&&!previousFocus.closest?.('#sidebar')?previousFocus:$('toggleSidebar');target.focus({preventScroll:true})}
    }
  }
  $('toggleSidebar').onclick=()=>setOpen(!open);close.onclick=()=>setOpen(false);backdrop.onclick=()=>setOpen(false);
  $('showSidebar').checked=false;$('showSidebar').onchange=()=>{const checked=$('showSidebar').checked;if(checked)$('settingsDialog').close();setOpen(checked)};
  $('sidebarPages').onclick=()=>{setOpen(false,{restoreFocus:false});$('showPages').click()};$('openAI').addEventListener('click',()=>setOpen(false,{restoreFocus:false}));
  document.addEventListener('notepad:book-selected',()=>setOpen(false));
  document.addEventListener('keydown',e=>{
    if(!open)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setOpen(false)}
    if(e.key==='Tab'){
      const stops=[$('toggleSidebar'),...sidebar.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n=>!n.disabled&&!n.hidden&&!n.inert&&n.getClientRects().length);
      const index=stops.indexOf(document.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();stops.at(-1).focus()}else if(!e.shiftKey&&(index<0||index===stops.length-1)){e.preventDefault();stops[0].focus()}
    }
  },true);
  document.addEventListener('focusin',e=>{if(open&&!sidebar.contains(e.target)&&e.target!==$('toggleSidebar')&&!e.target.closest?.('dialog'))$('bookSearch').focus({preventScroll:true})});
  document.addEventListener('pointerdown',e=>{for(const details of [docMenu,$('extraTools')])if(details.open&&!details.contains(e.target)){details.open=false;if(e.target===canvas){e.preventDefault();e.stopImmediatePropagation()}}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const details of [docMenu,$('extraTools')])if(details.open){details.open=false;details.querySelector('summary').focus()}});
  for(const details of [docMenu,$('extraTools')]){
    details.querySelector('summary').setAttribute('aria-expanded','false');details.addEventListener('toggle',()=>details.querySelector('summary').setAttribute('aria-expanded',String(details.open)));
    details.addEventListener('click',e=>{if(e.target.closest('button')&&details===docMenu){details.open=false;details.querySelector('summary').focus({preventScroll:true})}});
  }
  $('focusMode').onclick=()=>{finish();setOpen(false,{restoreFocus:false});docMenu.open=false;$('extraTools').open=false;const focused=document.body.classList.toggle('focus-mode');$('focusMode').setAttribute('aria-pressed',String(focused));decorate($('focusMode'),focused?'exitFocus':'focus',focused?'Выйти из фокуса':'Режим фокуса',true)};
  $('toolbar').setAttribute('aria-label','Инструменты письма');for(const button of document.querySelectorAll('.tool'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
  const search=$('bookSearch'),searchWrap=document.createElement('div');searchWrap.className='search-field';search.before(searchWrap);searchWrap.append(icon('search'),search);search.placeholder='Поиск по тетрадям';
  const vasilySection=document.createElement('section');vasilySection.id='vasilySettings';const vasilyTitle=document.createElement('h3');vasilyTitle.textContent='Василий';const connectionStatus=document.createElement('p');connectionStatus.id='aiConnectionStatus';connectionStatus.setAttribute('role','status');connectionStatus.textContent=$('aiStatus').textContent;new MutationObserver(()=>connectionStatus.textContent=$('aiStatus').textContent).observe($('aiStatus'),{childList:true,subtree:true,characterData:true});vasilySection.append(vasilyTitle,connectionStatus,$('aiSetup'));$('dataSettings').before(vasilySection);
  const connectionHint=document.createElement('p');connectionHint.className='hint';connectionHint.textContent='Подключение настраивается в Настройки → Василий. Здесь можно задавать вопросы и выбирать вложения.';$('aiStatus').after(connectionHint);
  preferences.showSidebar=false;sidebar.setAttribute('aria-hidden','true');sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','false');renderBooks();
  return {decorate,sidebar:{setOpen,close:options=>setOpen(false,options),get open(){return open}}};
})();
const Sidebar=Interface.sidebar;
for(const [dialog,trigger]of [['settingsDialog','openSettings'],['pagesDialog','showPages'],['aiDialog','openAI']])$(dialog).addEventListener('close',()=>{if(!document.querySelector('dialog[open]')&&!Sidebar.open&&(!document.activeElement||document.activeElement===document.body||!document.activeElement.getClientRects().length))$(trigger==='openAI'?'toggleSidebar':trigger).focus({preventScroll:true})});
