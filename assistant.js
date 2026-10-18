/* No OpenAI credentials are accepted by this client. */
const AIAssistant=(()=>{
  let endpoint=window.NOTEPAD_CONFIG?.aiEndpoint||'';
  try{endpoint=localStorage.getItem('notepad-ai-endpoint')??endpoint}catch{}
  let requestController=null;
  function validateEndpoint(value){
    if(!value.trim())return '';
    const url=new URL(value.trim());
    if((url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.hostname==='api.openai.com'||/sk-[a-z0-9]/i.test(value))throw new Error('Укажите HTTPS-адрес своего сервера без ключей, паролей и параметров');
    return url.href.replace(/\/$/,'');
  }
  $('aiEndpoint').value=endpoint;
  $('aiConnectionForm').onsubmit=async e=>{e.preventDefault();if(busy)return;try{const next=validateEndpoint($('aiEndpoint').value);endpoint=next;localStorage.setItem('notepad-ai-endpoint',next);history.length=0;$('chatMessages').replaceChildren();await connect()}catch(error){$('aiStatus').textContent=error.message}};
  $('resetAIEndpoint').onclick=()=>{if(busy)return;localStorage.removeItem('notepad-ai-endpoint');endpoint=window.NOTEPAD_CONFIG?.aiEndpoint||'';$('aiEndpoint').value=endpoint;connect()};
  $('retryAIConnection').onclick=()=>{if(!busy)connect()};$('cancelAI').onclick=()=>requestController?.abort();
  let connected=false,busy=false;const history=[];
  function showMessage(role,text){
    const card=document.createElement('div');card.className='message '+role;card.textContent=text;
    if(role==='assistant'){const insert=document.createElement('button');insert.textContent='Вставить ответ в новые страницы';insert.onclick=()=>{insertTextPages(text);$('aiDialog').close()};card.append(insert)}
    $('chatMessages').append(card);card.scrollIntoView({block:'nearest'});
  }
  async function connect(){
    connected=false;$('sendAI').disabled=true;
    if(!endpoint){$('aiStatus').textContent='Василий пока не подключён — сервер ещё не настроен';$('aiSetup').open=true;return}
    try{
      const url=new URL(validateEndpoint(endpoint));if(url.protocol!=='https:'&&!(url.hostname==='127.0.0.1'||url.hostname==='localhost'))throw new Error('Нужен HTTPS-сервер');
      const response=await fetch(url.href.replace(/\/$/,'')+'/status',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const status=await response.json();connected=response.ok&&status.connected===true;
      $('aiStatus').textContent=connected?'Василий подключён через сервер':'Василий пока не подключён — проверьте сервер и вход в аккаунт';
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
      if($('attachPage').checked)pageImage=(await Documents.compose(currentBook,currentPage)).toDataURL('image/jpeg',.8);
      const documentText=$('attachDocument').checked?(currentBook.backgrounds||[]).map((item,i)=>item?.text?`Страница ${i+1}: ${item.text}`:'').join('\n').slice(0,40000):undefined;
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[...history.slice(-18),{role:'user',content:text}],pageImage,documentText}),signal:requestController.signal});
      if(!response.ok)throw new Error(response.status===401?'Войдите на сервере Василия':response.status===429?'Лимит запросов исчерпан. Повторите позже':response.status===413?'Вложение слишком большое':response.status===503?'Сервер Василия ещё не настроен':'Сервер не смог получить ответ');
      const result=await response.json();if(typeof result.text!=='string'||!result.text.trim())throw new Error('Сервер вернул пустой ответ');
      history.push({role:'user',content:text},{role:'assistant',content:result.text});showMessage('user',text);showMessage('assistant',result.text);$('chatInput').value='';$('aiStatus').textContent='Ответ получен';
    }catch(error){$('aiStatus').textContent=requestController?.signal.aborted?(requestController.signal.reason==='timeout'?'Время ожидания истекло. Повторите запрос':'Запрос остановлен'):'Запрос не выполнен: '+error.message}finally{clearTimeout(timeout);requestController=null;busy=false;$('cancelAI').hidden=true;$('chatForm').setAttribute('aria-busy','false');$('sendAI').disabled=!connected}
  };
  return {connect,validateEndpoint};
})();
