/* Provider credentials stay on the server; the client only handles its session. */
const AIAssistant=(()=>{
  let endpoint=window.NOTEPAD_CONFIG?.aiEndpoint||'';
  try{endpoint=localStorage.getItem('notepad-ai-endpoint')??endpoint}catch{}
  let requestController=null;
  function validateEndpoint(value){
    if(!value.trim())return '';
    const url=new URL(value.trim());
    if((url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||['api.openai.com','api.groq.com','generativelanguage.googleapis.com','openrouter.ai'].includes(url.hostname)||/(sk-|gsk_|AIza)[a-z0-9]/i.test(value))throw new Error('Укажите HTTPS-адрес своего сервера без ключей, паролей и параметров');
    return url.href.replace(/\/$/,'');
  }
  $('aiEndpoint').value=endpoint;
  $('aiConnectionForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{const next=validateEndpoint($('aiEndpoint').value);endpoint=next;localStorage.setItem('notepad-ai-endpoint',next);history.length=0;$('chatMessages').replaceChildren();await connect()}catch(error){$('aiStatus').textContent=error.message}};
  $('resetAIEndpoint').onclick=()=>{if(busy)return;localStorage.removeItem('notepad-ai-endpoint');endpoint=window.NOTEPAD_CONFIG?.aiEndpoint||'';$('aiEndpoint').value=endpoint;connect()};
  $('retryAIConnection').onclick=()=>{if(!busy)connect()};$('cancelAI').onclick=()=>requestController?.abort();
  let connected=false,busy=false;const history=[];let capabilities={};
  const auth=document.createElement('div');auth.id='aiAuth';auth.hidden=true;auth.innerHTML='<form id="aiLoginForm"><label>Пароль вашего сервера<input id="aiPassword" type="password" autocomplete="current-password" maxlength="256" required></label><button id="aiLogin">Войти</button><button id="aiLogout" type="button">Выйти</button></form><p id="aiAuthStatus" role="status"></p>';$('aiSetup').append(auth);
  async function sessionAction(action){
    if(busy)return;$('aiLogin').disabled=true;$('aiLogout').disabled=true;
    try{if(!endpoint)throw new Error('Сначала настройте адрес сервера');const response=await fetch(validateEndpoint(endpoint)+'/'+action,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='login'?{password:$('aiPassword').value}:{}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(response.status===429?'Слишком много попыток. Повторите через 15 минут':response.status===401?'Неверный пароль':'Сервер не выполнил вход или выход');$('aiAuthStatus').textContent=action==='login'?'Вход выполнен':'Вы вышли';history.length=0;$('chatMessages').replaceChildren();await connect()}catch(error){$('aiAuthStatus').textContent=error.message}finally{$('aiPassword').value='';$('aiLogin').disabled=false;$('aiLogout').disabled=false}
  }
  $('aiLoginForm').onsubmit=e=>{e.preventDefault();return sessionAction('login')};$('aiLogout').onclick=()=>sessionAction('logout');
  function showMessage(role,text){
    const card=document.createElement('div');card.className='message '+role;card.textContent=text;
    if(role==='assistant'){const insert=document.createElement('button');insert.textContent='Вставить ответ в новые страницы';insert.onclick=()=>{insertTextPages(text);$('aiDialog').close()};card.append(insert)}
    $('chatMessages').append(card);card.scrollIntoView({block:'nearest'});
  }
  async function connect(){
    connected=false;capabilities={};$('sendAI').disabled=true;auth.hidden=true;
    if(!endpoint){$('aiStatus').textContent='Василий пока не подключён — сервер ещё не настроен';$('aiSetup').open=true;return}
    try{
      const url=new URL(validateEndpoint(endpoint));if(url.protocol!=='https:'&&!(url.hostname==='127.0.0.1'||url.hostname==='localhost'))throw new Error('Нужен HTTPS-сервер');
      const response=await fetch(url.href.replace(/\/$/,'')+'/status',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const status=await response.json();connected=response.ok&&status.connected===true;auth.hidden=status.login!==true;capabilities=status.capabilities||{};$('attachPage').disabled=capabilities.pageImage===false;if(capabilities.pageImage===false)$('attachPage').checked=false;$('aiCapabilities').textContent=capabilities.pageImage===false?'Groq работает с текстом: изображение страницы и рукопись не отправляются. По вашему выбору передаются первые '+(capabilities.maxDocumentChars||6000)+' символов доступного текста конспекта. Материалы уходят серверу и Groq только при отправке.':'Материалы отправляются серверу и его провайдеру только по вашему выбору. До 40 000 символов доступного текста; распознавание сканов и почерка не гарантируется.';
      $('aiStatus').textContent=connected?'Василий подключён через сервер'+(status.provider?' · '+status.provider:''):response.status===401?'Василий пока не подключён — войдите в настройках Василия':'Василий пока не подключён — проверьте сервер и вход в аккаунт';
    }catch{$('aiStatus').textContent='Василий пока не подключён — сервер недоступен или истекло время ожидания'}
    $('sendAI').disabled=!connected||busy;
  }
  $('openAI').onclick=()=>{$('aiDialog').showModal();connect()};$('closeAI').onclick=()=>$('aiDialog').close();
  document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('chatInput').value=button.dataset.prompt;$('chatInput').focus()});
  $('chatForm').onsubmit=async e=>{
    e.preventDefault();const text=$('chatInput').value.trim();if(!text||!connected||busy)return;
    busy=true;requestController=new AbortController();const timeout=setTimeout(()=>requestController?.abort('timeout'),90000);$('cancelAI').hidden=false;$('chatForm').setAttribute('aria-busy','true');$('sendAI').disabled=true;$('aiStatus').textContent='Василий готовит ответ…';
    try{
      finish();const currentBook=book,currentPage=page;let pageImage;
      if($('attachPage').checked&&capabilities.pageImage!==false)pageImage=(await Documents.compose(currentBook,currentPage)).toDataURL('image/jpeg',.8);
      const documentText=$('attachDocument').checked?currentBook.pages.map((items,i)=>{const hidden=new Set(items.filter(s=>s.tool==='stroke-eraser').flatMap(s=>s.targets));return ['Страница '+(i+1),currentBook.backgrounds?.[i]?.text||'',...Shapes.resolve(items,false).filter((s,j)=>s&&!hidden.has(j)).map(s=>s.type==='text'||s.type==='text-block'?s.text:s.type==='chart-object'?JSON.stringify({title:s.title,expression:s.expression,data:s.data,nodes:s.nodes}):'')].join('\n')}).join('\n').slice(0,Math.min(40000,capabilities.maxDocumentChars||40000)):undefined;
      const messages=[...history.slice(-18),{role:'user',content:text}],budget=capabilities.maxConversationChars||240000;while(messages.length>1&&messages.reduce((n,m)=>n+m.content.length,0)+(documentText?.length||0)>budget)messages.shift();if(text.length+(documentText?.length||0)>budget)throw new Error('Сообщение вместе с конспектом слишком длинное. Сократите вопрос или отключите вложение');
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,pageImage,documentText}),signal:requestController.signal});
      if(!response.ok){let failure={};try{failure=await response.json()}catch{};throw new Error(response.status===422?'Эта модель не поддерживает изображения':failure.error==='provider_access_denied'?'Серверный API-ключ недействителен или провайдер недоступен для аккаунта':response.status===401?'Войдите на сервере Василия':response.status===429?'Лимит запросов исчерпан. Повторите позже':response.status===413?'Вложение слишком большое':response.status===503?'Сервер Василия ещё не настроен':'Сервер не смог получить ответ');}
      const result=await response.json();if(typeof result.text!=='string'||!result.text.trim())throw new Error('Сервер вернул пустой ответ');
      history.push({role:'user',content:text},{role:'assistant',content:result.text});showMessage('user',text);showMessage('assistant',result.text);$('chatInput').value='';$('aiStatus').textContent='Ответ получен';
    }catch(error){$('aiStatus').textContent=requestController?.signal.aborted?(requestController.signal.reason==='timeout'?'Время ожидания истекло. Повторите запрос':'Запрос остановлен'):'Запрос не выполнен: '+error.message}finally{clearTimeout(timeout);requestController=null;busy=false;$('cancelAI').hidden=true;$('chatForm').setAttribute('aria-busy','false');$('sendAI').disabled=!connected}
  };
  return {connect,validateEndpoint};
})();
