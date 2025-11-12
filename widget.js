/* widget.js — final integrated widget script
   Features:
   - FAB toggle with dynamic shifting (desktop & mobile)
   - Unread badge + persistence
   - Quick actions
   - Typing indicator
   - Tracking endpoints
   - Custom animated cursor
   - Keyboard shortcuts: / to focus, Escape to close
*/

(function(){
  // config from data attributes
  const root = document.getElementById('chat-widget');
  const API_BASE = root?.dataset?.apiBase || 'http://localhost:8080';
  const BOT_NAME = root?.dataset?.botName || 'AI Site Assistant';

  // elements
  const chatPanel = document.querySelector('.chat-panel');
  const fab = document.getElementById('chatFab');
  const fabBadge = document.getElementById('fabBadge');
  const closeBtn = document.getElementById('closeBtn');
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const quickActions = document.getElementById('quickActions');
  const statusEl = document.getElementById('bot-status');
  const botNameEl = document.getElementById('bot-name');

  if(botNameEl) botNameEl.textContent = BOT_NAME;

  // state
  let unread = 0;
  let isOpen = false;
  const OPEN_KEY = 'chat_open_v1';

  // initialize open state from storage
  isOpen = localStorage.getItem(OPEN_KEY) === '1';
  if(isOpen) {
    setTimeout(()=> openPanel(false), 80);
  }

  // metrics tracking helper (non-blocking)
  function track(type, extra){
    try {
      const payload = JSON.stringify({ type, extra: extra || null });
      if(navigator.sendBeacon){
        navigator.sendBeacon(API_BASE + '/api/track', payload);
      } else {
        fetch(API_BASE + '/api/track', { method:'POST', headers:{'Content-Type':'application/json'}, body: payload }).catch(()=>{});
      }
    } catch(e){}
  }

  // custom cursor
  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  document.body.appendChild(cursor);
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  });
  // expand cursor on hover over interactive elements
  function setCursorHover(isHover){
    if(isHover) cursor.classList.add('sticky'); else cursor.classList.remove('sticky');
  }
  ['button','.qa','.chat-fab','.icon-btn'].forEach(sel => {
    document.addEventListener('mouseover', e => {
      if(e.target.closest(sel)) setCursorHover(true);
    });
    document.addEventListener('mouseout', e => {
      if(e.target.closest(sel) === null) setCursorHover(false);
    });
  });

  // append message helper (sanitized plain text)
  function appendMessage(text, who='bot'){
    const div = document.createElement('div');
    div.className = 'msg ' + who;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if(!isOpen && who === 'bot'){
      unread += 1; updateBadge();
    }
  }

  function updateBadge(){
    if(unread > 0){
      fabBadge.hidden = false;
      fabBadge.textContent = unread > 99 ? '99+' : unread;
    } else {
      fabBadge.hidden = true;
    }
  }

  // typing indicator visuals
  function showTyping(){
    hideTyping();
    const t = document.createElement('div');
    t.className = 'msg bot typing';
    t.setAttribute('data-typing','1');
    t.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping(){
    const t = messagesEl.querySelector('[data-typing="1"]');
    if(t) t.remove();
  }

  // dynamic FAB shifting to avoid overlap
  function updateFabPosition(shouldShift){
    if(!chatPanel || !fab) return;
    if(!shouldShift){
      fab.style.transform = '';
      fab.classList.remove('shifted','shifted-vertical');
      return;
    }
    const panelRect = chatPanel.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const mobileBreakpoint = 720;
    if(vw <= mobileBreakpoint){
      const shiftY = (panelRect.height + 24);
      fab.style.transform = `translateY(${ -shiftY }px) scale(.88)`;
      fab.classList.add('shifted','shifted-vertical');
    } else {
      const margin = 18;
      const shiftX = panelRect.width + margin;
      const nudgeY = -8;
      fab.style.transform = `translateX(${ -shiftX }px) translateY(${ nudgeY }px) scale(.88)`;
      fab.classList.add('shifted');
      fab.classList.remove('shifted-vertical');
    }
  }

  // open / close
  function openPanel(focus=true){
    chatPanel.classList.add('open');
    chatPanel.setAttribute('aria-hidden','false');
    isOpen = true;
    localStorage.setItem(OPEN_KEY,'1');
    fab.setAttribute('aria-label','Close chat');
    updateFabPosition(true);
    // small pulse for feedback
    fab.style.transform = fab.style.transform;
    unread = 0; updateBadge();
    if(focus) inputEl.focus();
    track('open');
  }

  function closePanel(){
    chatPanel.classList.remove('open');
    chatPanel.setAttribute('aria-hidden','true');
    isOpen = false;
    localStorage.setItem(OPEN_KEY,'0');
    fab.setAttribute('aria-label','Open chat');
    updateFabPosition(false);
    track('close');
  }

  // toggle via FAB
  fab.addEventListener('click', ()=> {
    if(isOpen) closePanel(); else openPanel(true);
  });
  closeBtn && closeBtn.addEventListener('click', closePanel);

  // keyboard shortcuts
  document.addEventListener('keydown', (e)=>{
    if(e.key === '/' && document.activeElement !== inputEl){
      e.preventDefault();
      if(!isOpen) openPanel(true); else inputEl.focus();
    }
    if(e.key === 'Escape' && isOpen) closePanel();
  });

  // quick actions handling
  quickActions && quickActions.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.qa');
    if(!btn) return;
    const action = btn.dataset.action;
    if(action === 'faq') sendMessage('What are your FAQs?');
    else if(action === 'pricing') sendMessage('What are your pricing plans?');
    else if(action === 'contact') sendMessage('How can I contact support?');
    track('quick_action', action);
  });

  // send message flow
  async function sendMessage(text){
    if(!text || !text.trim()) return;
    appendMessage(text, 'user');
    inputEl.value = '';
    track('click');
    showTyping();
    statusEl && (statusEl.textContent = 'Typing...');
    try {
      const res = await fetch(API_BASE + '/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: text })
      });
      hideTyping();
      statusEl && (statusEl.textContent = 'Online');
      if(!res.ok){
        const err = await res.json().catch(()=>({detail:res.statusText}));
        appendMessage('Error: ' + (err.detail || res.statusText), 'bot');
        return;
      }
      const data = await res.json();
      appendMessage(data.reply || 'No reply', 'bot');
    } catch(err){
      hideTyping();
      statusEl && (statusEl.textContent = 'Offline');
      appendMessage('Network error: ' + (err && err.message ? err.message : 'unknown'), 'bot');
    }
  }

  sendBtn && sendBtn.addEventListener('click', ()=> sendMessage(inputEl.value.trim()));
  inputEl && inputEl.addEventListener('keypress', (e)=> { if(e.key === 'Enter') sendBtn.click(); });

  // visibility impression
  document.addEventListener('visibilitychange', ()=> {
    if(document.visibilityState === 'visible') track('impression');
  });

  // initial impression
  track('impression');

  // resize handling (debounced)
  let _fabResizeTimer = null;
  window.addEventListener('resize', ()=> {
    clearTimeout(_fabResizeTimer);
    _fabResizeTimer = setTimeout(()=> { if(isOpen) updateFabPosition(true); }, 120);
  });

  // optional: auto-scroll to bottom when content changes (observer)
  const obs = new MutationObserver(()=> { messagesEl.scrollTop = messagesEl.scrollHeight; });
  obs.observe(messagesEl, { childList: true, subtree: false });

  // ensure badge initial state
  updateBadge();

  // accessibility: focus input on open
  // done in openPanel

})();
