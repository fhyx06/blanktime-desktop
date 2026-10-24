(() => {
  'use strict';
  const win = document.getElementById('terminal');
  if (!win || !window.blanktimeTerminalCore) return;
  const $ = name => document.getElementById('terminal-' + name);
  const input = $('input'), output = $('output'), screen = $('screen'), form = $('form');
  let config = {};
  try { config = JSON.parse($('config').textContent); } catch {}
  if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
  const presentation = window.blanktimeTerminalCore.configure(config);
  Object.entries(presentation.colors).forEach(([role,color]) => {
    win.style.setProperty('--terminal-color-' + role,color);
  });
  const message = (key,values) => presentation.message(key,values);
  const username = /^[a-zA-Z0-9_-]{1,32}$/.test(config.username) ? config.username : 'visitor';
  const hostname = /^[a-zA-Z0-9_.-]{1,64}$/.test(config.hostname) ? config.hostname : 'blanktime';
  const identity = `${username}@${hostname}`;
  let shell, history = [], historyIndex = 0, draft = '', composing = false;
  let lastLogin = null;
  const LOGIN_KEY = 'blanktime:terminal:last-login:v1';
  const MAX_HISTORY = 100, MAX_BLOCKS = 160;
  input.maxLength = 4096;

  function loginMessage(now) {
    let previous = lastLogin;
    try {
      const saved = Number(localStorage.getItem(LOGIN_KEY));
      if (Number.isFinite(saved) && saved > 0 && saved <= now.getTime()) previous = new Date(saved);
    } catch {}
    const date = previous || now;
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const time = [date.getHours(),date.getMinutes(),date.getSeconds()].map(value => String(value).padStart(2,'0')).join(':');
    lastLogin = now;
    // Store only the previous session's opening time, never commands or output.
    try { localStorage.setItem(LOGIN_KEY,String(now.getTime())); } catch {}
    return message('last_login',{date:`${weekdays[date.getDay()]} ${months[date.getMonth()]} ${String(date.getDate()).padStart(2,' ')} ${time} ${date.getFullYear()}`});
  }

  // Build metadata only when the terminal opens. Listing an album never loads its images.
  function initialize() {
    if (shell) return;
    const startedAt = new Date();
    const posts = [...document.querySelectorAll('#files-list .post-file')].map(row => ({
      title:row.dataset.title, date:Number(row.dataset.date), search:row.dataset.search,
      url:row.querySelector('.file-link')?.href
    }));
    const cards = [...document.querySelectorAll('#album-grid .album-card')];
    const albums = [...document.querySelectorAll('#album-folders .album-folder')].map(folder => ({
      id:folder.dataset.folder, name:folder.querySelector('strong').textContent,
      images:cards.filter(card => card.dataset.folder === folder.dataset.folder).map(card => ({
        name:card.dataset.name, url:card.dataset.src, size:card.dataset.size,
        wallpaper:card.dataset.wallpaper === 'true'
      }))
    }));
    const apps = [{name:'文件管理.desktop',id:'files'}, {name:'浏览器.desktop',id:'browser'},
      {name:'相册.desktop',id:'album'}, {name:'音乐.desktop',id:'music'},
      {name:'基础信息.desktop',id:'system-info'}, {name:'终端.desktop',id:'terminal'}]
      .filter(app => document.getElementById(app.id));
    shell = window.blanktimeTerminalCore.create({...config,username,hostname,posts,albums,apps,createdAt:startedAt.getTime()});
    const welcome = typeof config.welcome === 'string' ? config.welcome.slice(0,2000) : 'Blanktime Terminal';
    if (welcome) write([{text:welcome,kind:'welcome'}]);
    write([loginMessage(startedAt)]);
    refreshPrompt();
  }
  function prompt() { return `${identity}:${shell.getPromptPath()}$`; }
  function refreshPrompt() {
    $('prompt').textContent = prompt();
  }
  function scrollToInput() { screen.scrollTop = screen.scrollHeight; }
  function write(lines, command) {
    const block = document.createElement('div');
    block.className = 'terminal-block';
    if (command !== undefined) {
      const echo = document.createElement('div');
      echo.className = 'terminal-echo';
      const label = document.createElement('span');
      label.className = 'terminal-prompt'; label.textContent = prompt() + ' ';
      echo.append(label,document.createTextNode(command)); block.append(echo);
    }
    lines.forEach(line => {
      const row = document.createElement('div');
      const kind = ['error','muted','directory','success','welcome','warning','info'].includes(line.kind) ? line.kind : 'text';
      row.className = 'terminal-line terminal-' + kind;
      row.textContent = String(line.text ?? '');
      const columns = kind === 'welcome' ? Math.max(...row.textContent.split('\n').map(value => value.length)) : 0;
      if (columns > 60 && row.textContent.includes('\n')) {
        row.classList.add('terminal-banner');
        row.style.setProperty('--terminal-banner-font',`${(100 / (columns * .62)).toFixed(3)}cqw`);
      }
      block.append(row);
    });
    output.append(block);
    let rowCount = [...output.children].reduce((total, item) => total + item.children.length, 0);
    while (output.children.length > MAX_BLOCKS || (rowCount > 2000 && output.children.length > 1)) {
      rowCount -= output.firstElementChild.children.length;
      output.firstElementChild.remove();
    }
    scrollToInput();
  }
  function actionError(key,values) {
    const line = message(key,values);
    const error = new Error(line.text);
    error.terminalMessage = line;
    return error;
  }
  function openApp(id,context) {
    // Only known windows can be launched; paths and command strings never execute JavaScript.
    if (!['files','browser','album','music','system-info','terminal'].includes(id)) throw actionError('app_unavailable',{...context,name:id});
    const target = document.getElementById(id);
    if (!target || !window.blanktimeDesktop) throw actionError('app_unavailable',{...context,name:id});
    window.blanktimeDesktop.openWindow(target);
  }
  function perform(action,context) {
    if (!action) return;
    if (action.type === 'clear') { output.replaceChildren(); return; }
    if (action.type === 'exit') { window.blanktimeDesktop.closeWindow(win); return; }
    if (action.type === 'article') {
      document.dispatchEvent(new CustomEvent('blanktime:open-article',{detail:{href:action.url}}));
    } else if (action.type === 'image') {
      if (!window.blanktimeImages) throw actionError('viewer_unavailable',context);
      window.blanktimeImages.open(action.items,action.index,{kind:'album',source:action.source,trigger:input});
    } else if (action.type === 'app') openApp(action.id,context);
    else if (action.type === 'folder') {
      openApp(action.appId,context);
      if (action.appId === 'album') {
        if (action.folderId !== undefined) {
          const button = [...document.querySelectorAll('#album-folders .album-folder')]
            .find(folder => folder.dataset.folder === action.folderId);
          if (!button) throw actionError('folder_unavailable',{...context,path:action.path});
          button.click();
        } else document.getElementById('album-folders-back')?.click();
      }
    }
    // Opening another application should dismiss the mobile keyboard.
    if (action.type !== 'app' || action.id !== 'terminal') input.blur();
  }
  function run() {
    initialize();
    if (composing) return;
    const command = input.value.slice(0,4096);
    input.value = '';
    if (!command.trim()) return;
    if (history.at(-1) !== command) history.push(command);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length; draft = '';
    // Echo uses the directory before cd; the new prompt uses the resulting directory.
    write([],command);
    try {
      const result = shell.execute(command);
      if (result.lines?.length) write(result.lines);
      refreshPrompt();
      perform(result.action,result.context);
    } catch (error) {
      console.error('[terminal] Command failed:', error);
      write([error.terminalMessage || message('operation_failed',{input:command})]);
    }
    scrollToInput();
  }
  function recall(direction) {
    if (!history.length) return;
    if (historyIndex === history.length) draft = input.value;
    historyIndex = Math.max(0,Math.min(history.length,historyIndex + direction));
    input.value = historyIndex === history.length ? draft : history[historyIndex];
    input.setSelectionRange(input.value.length,input.value.length);
    scrollToInput();
  }
  function complete() {
    initialize();
    if (composing) return;
    // Only complete at the end; partial-token suffixes must never be duplicated.
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start !== input.value.length || end !== start) return;
    const result = shell.complete(input.value);
    if (typeof result.value === 'string') {
      input.value = result.value.slice(0,4096);
      input.setSelectionRange(result.value.length,result.value.length);
    }
    if (result.candidates?.length > 1) {
      write([{text:result.candidates.slice(0,80).join('   '),kind:'directory'}]);
    }
  }
  form.addEventListener('submit',event => { event.preventDefault(); run(); });
  input.addEventListener('compositionstart',() => { composing = true; });
  input.addEventListener('compositionend',() => { composing = false; });
  input.addEventListener('keydown',event => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'Enter') { event.preventDefault(); run(); return; }
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); complete();
    } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'l') {
      event.preventDefault(); output.replaceChildren();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'c' && !window.getSelection()?.toString() && input.selectionStart === input.selectionEnd) {
      event.preventDefault(); initialize(); write([],input.value + '^C');
      input.value = ''; historyIndex = history.length; draft = '';
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); recall(event.key === 'ArrowUp' ? -1 : 1);
    }
  });
  win.querySelectorAll('[data-terminal-key]').forEach(button => {
    button.addEventListener('pointerdown',event => event.preventDefault());
    button.addEventListener('click',() => {
      input.focus({preventScroll:true});
      const key = button.dataset.terminalKey;
      if (key === 'complete') complete();
      else if (key === 'clear') output.replaceChildren();
      else recall(key === 'previous' ? -1 : 1);
    });
  });
  screen.addEventListener('click',event => {
    if (event.target === screen && !window.getSelection()?.toString()) input.focus({preventScroll:true});
  });
  function resizeForKeyboard() {
    const viewport = window.visualViewport;
    const keyboard = !win.hidden && win.dataset.state === 'open' && window.innerWidth <= 760 &&
      document.activeElement === input && viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 120;
    win.classList.toggle('terminal-keyboard-open',Boolean(keyboard));
    if (keyboard) {
      win.style.setProperty('--terminal-keyboard-top',`${viewport.offsetTop + 6}px`);
      win.style.setProperty('--terminal-keyboard-height',`${Math.max(120,viewport.height - 12)}px`);
      scrollToInput();
    } else {
      win.style.removeProperty('--terminal-keyboard-top');
      win.style.removeProperty('--terminal-keyboard-height');
    }
  }
  window.visualViewport?.addEventListener('resize',resizeForKeyboard);
  window.visualViewport?.addEventListener('scroll',resizeForKeyboard);
  window.addEventListener('resize',resizeForKeyboard);
  input.addEventListener('focus',resizeForKeyboard);
  input.addEventListener('blur',resizeForKeyboard);
  win.addEventListener('blanktime:window-opened',() => {
    initialize(); input.focus({preventScroll:true}); resizeForKeyboard(); scrollToInput();
  });
  win.addEventListener('blanktime:window-hidden',event => {
    input.blur(); resizeForKeyboard();
    if (event.detail?.state !== 'closed') return;
    shell = null; history = []; historyIndex = 0; draft = ''; composing = false;
    input.value = ''; output.replaceChildren();
    $('prompt').textContent = `${identity}:~$`;
  });
})();
