/* No OpenAI credentials are accepted by this client. */
const AIAssistant=(()=>{
  const endpoint=window.NOTEPAD_CONFIG?.aiEndpoint||'';
  let connected=false,busy=false;const history=[];
  function showMessage(role,text){
    const card=document.createElement('div');card.className='message '+role;card.textContent=text;
    if(role==='assistant'){const insert=document.createElement('button');insert.textContent='Вставить ответ в новые страницы';insert.onclick=()=>{insertTextPages(text);$('aiDialog').close()};card.append(insert)}
    $('chatMessages').append(card);card.scrollIntoView({block:'nearest'});
  }
  async function connect(){
    if(!endpoint){$('aiStatus').textContent='ИИ не подключён — сервер ещё не настроен';return}
    try{
      const url=new URL(endpoint);if(url.protocol!=='https:'&&!(url.hostname==='127.0.0.1'||url.hostname==='localhost'))throw new Error('Нужен HTTPS-сервер');
      const response=await fetch(url.href.replace(/\/$/,'')+'/status',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const status=await response.json();connected=response.ok&&status.connected===true;
      $('aiStatus').textContent=connected?'GPT подключён через сервер':'ИИ не подключён — проверьте сервер и вход в аккаунт';
    }catch{$('aiStatus').textContent='ИИ не подключён — сервер недоступен'}
    $('sendAI').disabled=!connected||busy;
  }
  $('openAI').onclick=()=>{$('aiDialog').showModal();connect()};$('closeAI').onclick=()=>$('aiDialog').close();
  document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('chatInput').value=button.dataset.prompt;$('chatInput').focus()});
  $('chatForm').onsubmit=async e=>{
    e.preventDefault();const text=$('chatInput').value.trim();if(!text||!connected||busy)return;
    busy=true;$('sendAI').disabled=true;$('aiStatus').textContent='Подготовка запроса…';
    try{
      finish();const currentBook=book,currentPage=page;let pageImage;
      if($('attachPage').checked)pageImage=(await Documents.compose(currentBook,currentPage)).toDataURL('image/jpeg',.8);
      const documentText=$('attachDocument').checked?(currentBook.backgrounds||[]).map((item,i)=>item?.text?`Страница ${i+1}: ${item.text}`:'').join('\n').slice(0,40000):undefined;
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[...history.slice(-18),{role:'user',content:text}],pageImage,documentText}),signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw new Error(response.status===401?'Войдите на сервере помощника':response.status===429?'Лимит запросов исчерпан':'Сервер не смог получить ответ');
      const result=await response.json();if(typeof result.text!=='string'||!result.text.trim())throw new Error('Сервер вернул пустой ответ');
      history.push({role:'user',content:text},{role:'assistant',content:result.text});showMessage('user',text);showMessage('assistant',result.text);$('chatInput').value='';$('aiStatus').textContent='Ответ получен';
    }catch(error){$('aiStatus').textContent='Запрос не выполнен: '+error.message}finally{busy=false;$('sendAI').disabled=!connected}
  };
  return {connect};
})();
