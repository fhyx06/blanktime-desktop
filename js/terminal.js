(() => {
  'use strict';
  const win = document.getElementById('terminal');
  if (!win || !window.blanktimeTerminalCore || !window.blanktimeFS) return;
  const $ = name => document.getElementById('terminal-' + name);
  const input = $('input'), output = $('output'), screen = $('screen'), form = $('form');
  let config = {};
  try { config = JSON.parse($('config').textContent); } catch {}
  if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
  const presentation = window.blanktimeTerminalCore.configure(config);
  win.style.setProperty('--terminal-font-size',presentation.fontSize + 'px');
  Object.entries(presentation.colors).forEach(([role,color]) => {
    win.style.setProperty('--terminal-color-' + role,color);
  });
  const message = (key,values) => presentation.message(key,values);
  const username = /^[a-zA-Z0-9_-]{1,32}$/.test(config.username) ? config.username : 'visitor';
  const hostname = /^[a-zA-Z0-9_.-]{1,64}$/.test(config.hostname) ? config.hostname : 'blanktime';
  let shell, history = [], historyIndex = 0, draft = '', composing = false;
  let authentication = null;
  const passwordInput = document.createElement('input');
  passwordInput.id = 'terminal-secret-input';
  // Use a no-echo keyboard target, not a web-login field. Bitwarden excludes search inputs.
  passwordInput.type = 'search';
  passwordInput.autocomplete = 'off';
  passwordInput.setAttribute('data-bwignore','true');
  passwordInput.maxLength = 4096;
  passwordInput.setAttribute('aria-label','终端密码（输入不显示）');
  passwordInput.setAttribute('autocapitalize','off');
  passwordInput.setAttribute('autocorrect','off');
  passwordInput.setAttribute('enterkeyhint','go');
  passwordInput.setAttribute('inputmode','text');
  passwordInput.spellcheck = false;
  // Also hide the input if the stylesheet fails to load; the prompt paints a fixed caret.
  passwordInput.style.opacity = '0';
  passwordInput.hidden = true;
  form.append(passwordInput);
  let lastLogin = null, lastLoginIP = '', loginRequest = null;
  const LOGIN_KEY = 'blanktime:terminal:last-login:v1';
  const LOGIN_IP_KEY = 'blanktime:terminal:last-login-ip:v1';
  const ipService = window.blanktimeIP;
  const MAX_HISTORY = 100, MAX_BLOCKS = 160;
  const LIST_CLASSES = new Map([
    ['permission','ll-perm'], ['owner','ll-own'], ['size','ll-size'], ['date','ll-date'],
    ['directory','ll-name is-dir'], ['image','ll-name is-img'], ['document','ll-name is-doc'], ['music','ll-name'], ['name','ll-name']
  ]);
  input.maxLength = 4096;

  function loginMessage(now) {
    let previous = lastLogin, previousIP = lastLoginIP;
    try {
      const saved = Number(localStorage.getItem(LOGIN_KEY));
      if (Number.isFinite(saved) && saved > 0 && saved <= now.getTime()) {
        if (previous?.getTime() !== saved) previousIP = '';
        previous = new Date(saved);
        if (ipService?.enabled) {
          const savedIP = JSON.parse(localStorage.getItem(LOGIN_IP_KEY));
          if (savedIP?.time === saved) previousIP = ipService.validate(savedIP.ip);
        }
      }
    } catch {}
    const date = previous || now;
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const time = [date.getHours(),date.getMinutes(),date.getSeconds()].map(value => String(value).padStart(2,'0')).join(':');
    lastLogin = now;
    lastLoginIP = '';
    // Keep only the latest login; IP metadata is paired by timestamp, never with another session.
    try {
      localStorage.setItem(LOGIN_KEY,String(now.getTime()));
      if (ipService?.enabled) localStorage.removeItem(LOGIN_IP_KEY);
    } catch {}
    const line = message('last_login',{date:`${weekdays[date.getDay()]} ${months[date.getMonth()]} ${String(date.getDate()).padStart(2,' ')} ${time} ${date.getFullYear()}`});
    if (ipService?.enabled && previousIP) line.text += message('last_login_ip',{ip:previousIP}).text;
    return {line,firstLogin:!previous};
  }
  function cancelLoginRequest() {
    if (!loginRequest) return;
    loginRequest.controller.abort();
    loginRequest = null;
  }
  async function lookupLoginIP(startedAt, row, line) {
    if (!ipService?.enabled) return;
    const controller = new AbortController();
    const request = {controller,session:shell};
    loginRequest = request;
    try {
      const ip = await ipService.query({signal:controller.signal});
      if (!ip || controller.signal.aborted || loginRequest !== request || shell !== request.session) return;
      lastLoginIP = ip;
      try {
        // Another browser tab may have opened a newer session while this request was pending.
        if (localStorage.getItem(LOGIN_KEY) === String(startedAt.getTime())) {
          localStorage.setItem(LOGIN_IP_KEY,JSON.stringify({time:startedAt.getTime(),ip}));
        }
      } catch {}
      // Only the first-ever login uses the current address. Older logins keep their own address.
      if (row && output.contains(row)) row.textContent = line.text + message('last_login_ip',{ip}).text;
    } catch {
      // An unavailable lookup must never block the prompt or add a terminal error.
    } finally {
      if (loginRequest === request) loginRequest = null;
    }
  }

  // Sessions share directory metadata; opening a new shell never rebuilds the filesystem.
  function initialize() {
    if (shell) return;
    win.classList.add('terminal-entering');
    const startedAt = new Date();
    shell = window.blanktimeTerminalCore.create({...config,username,hostname,filesystem:window.blanktimeFS});
    const welcome = typeof config.welcome === 'string' ? config.welcome.slice(0,2000) : 'Blanktime Terminal';
    if (welcome) write([{text:welcome,kind:'welcome'}]);
    const login = loginMessage(startedAt);
    const loginRow = write([login.line]).firstElementChild;
    lookupLoginIP(startedAt,login.firstLogin ? loginRow : null,login.line);
    refreshPrompt();
  }
  function part(className,text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }
  function paintPrompt(target) {
    const identity = shell ? shell.getIdentity() : {username,isRoot:false};
    target.classList.toggle('is-root',identity.isRoot);
    target.replaceChildren(
      part('pt-user',identity.username),part('pt-sep','@'),part('pt-host',hostname),part('pt-sep',':'),
      part('pt-path',shell ? shell.getPromptPath() : '~'),part('pt-dollar',identity.isRoot ? '#' : '$')
    );
  }
  function refreshPrompt() {
    if (authentication) return;
    paintPrompt($('prompt'));
  }
  function focusInput() {
    (authentication ? passwordInput : input).focus({preventScroll:true});
  }
  function endAuthentication() {
    authentication = null;
    composing = false;
    passwordInput.value = '';
    passwordInput.readOnly = false;
    passwordInput.hidden = true;
    input.hidden = false;
    input.value = '';
    form.classList.remove('is-password');
    form.removeAttribute('aria-busy');
    $('prompt').htmlFor = input.id;
    $('prompt').style.removeProperty('color');
    win.querySelectorAll('[data-terminal-key]').forEach(button => { button.disabled = false; });
    refreshPrompt();
  }
  function cancelAuthentication(echo = true) {
    if (!authentication) return;
    const {session,context} = authentication;
    session.cancelAuthentication();
    if (echo) {
      const line = message('su_password',context);
      write([{...line,text:line.text + ' ^C'}]);
    }
    endAuthentication();
  }
  function beginAuthentication(context) {
    if (!window.crypto?.subtle || typeof window.TextEncoder !== 'function') {
      shell.cancelAuthentication();
      write([message('su_auth_unavailable',context)]);
      return;
    }
    authentication = {session:shell,context,busy:false};
    const line = message('su_password',context), prompt = $('prompt');
    prompt.classList.remove('is-root');
    prompt.textContent = line.text;
    prompt.style.color = `var(--terminal-color-${line.kind})`;
    prompt.htmlFor = passwordInput.id;
    input.hidden = true;
    passwordInput.hidden = false;
    form.classList.add('is-password');
    win.querySelectorAll('[data-terminal-key]').forEach(button => {
      button.disabled = button.dataset.terminalKey !== 'clear';
    });
    focusInput();
  }
  async function submitPassword() {
    const request = authentication;
    if (!request || request.busy || composing) return;
    request.busy = true;
    passwordInput.readOnly = true;
    form.setAttribute('aria-busy','true');
    const bytes = new window.TextEncoder().encode(passwordInput.value);
    passwordInput.value = '';
    let result, unavailable = false;
    try {
      const verifier = config.root.verifier;
      const decode = hex => Uint8Array.from(hex.match(/../g),byte => parseInt(byte,16));
      const key = await window.crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveBits']);
      bytes.fill(0);
      if (authentication !== request || shell !== request.session) return;
      const actual = new Uint8Array(await window.crypto.subtle.deriveBits({
        name:'PBKDF2',hash:'SHA-256',salt:decode(verifier.salt),iterations:verifier.iterations
      },key,256));
      if (authentication !== request || shell !== request.session) return;
      const expected = decode(verifier.hash);
      let difference = actual.length ^ expected.length;
      for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
      actual.fill(0);
      result = request.session.finishAuthentication(difference === 0);
    } catch {
      // Do not log credentials or let unavailable browser crypto fall back to a weaker check.
      if (authentication !== request || shell !== request.session) return;
      request.session.cancelAuthentication();
      unavailable = true;
    } finally {
      bytes.fill(0);
    }
    if (authentication !== request || shell !== request.session) return;
    const focused = document.activeElement === passwordInput;
    write([message('su_password',request.context)]);
    endAuthentication();
    if (unavailable) write([message('su_auth_unavailable',request.context)]);
    else if (result?.lines?.length) write(result.lines);
    if (focused && !win.hidden) focusInput();
    scrollToInput();
  }
  function scrollToInput() { screen.scrollTop = screen.scrollHeight; }
  function write(lines, command) {
    const block = document.createElement('div');
    block.className = 'terminal-block';
    if (command !== undefined) {
      const echo = document.createElement('div');
      echo.className = 'terminal-echo';
      const label = document.createElement('span');
      label.className = 'terminal-prompt'; paintPrompt(label);
      echo.append(label,document.createTextNode(' ' + command)); block.append(echo);
    }
    lines.forEach(line => {
      const row = document.createElement('div');
      const kind = ['error','muted','directory','success','welcome','warning','info'].includes(line.kind) ? line.kind : 'text';
      row.className = 'terminal-line terminal-' + kind;
      row.textContent = String(line.text ?? '');
      if (Array.isArray(line.parts)) {
        row.replaceChildren(...line.parts.map(item => LIST_CLASSES.has(item.role)
          ? part(LIST_CLASSES.get(item.role),item.text) : document.createTextNode(item.text)));
      }
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
    return block;
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
    if (action.type === 'authenticate') { beginAuthentication(context); return; }
    if (action.type === 'clear') { output.replaceChildren(); return; }
    if (action.type === 'exit') { window.blanktimeDesktop.closeWindow(win); return; }
    if (action.type === 'article') {
      document.dispatchEvent(new CustomEvent('blanktime:open-article',{detail:{href:action.url}}));
    } else if (action.type === 'image') {
      if (!window.blanktimeImages) throw actionError('viewer_unavailable',context);
      window.blanktimeImages.open(action.items,action.index,{kind:'album',source:action.source,trigger:input});
    } else if (action.type === 'music') {
      if (typeof window.blanktimeMusic?.playTrack !== 'function' || !window.blanktimeMusic.playTrack(action.trackKey)) {
        throw actionError('app_unavailable',{...context,name:'music'});
      }
    } else if (action.type === 'app') openApp(action.id,context);
    else if (action.type === 'folder') {
      if (!window.blanktimeFiles?.openPath(action.path)) throw actionError('folder_unavailable',{...context,path:action.path});
    }
    // Opening another application should dismiss the mobile keyboard.
    if (action.type !== 'app' || action.id !== 'terminal') input.blur();
  }
  function run() {
    initialize();
    if (authentication) { void submitPassword(); return; }
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
    if (authentication) return;
    if (!history.length) return;
    if (historyIndex === history.length) draft = input.value;
    historyIndex = Math.max(0,Math.min(history.length,historyIndex + direction));
    input.value = historyIndex === history.length ? draft : history[historyIndex];
    input.setSelectionRange(input.value.length,input.value.length);
    scrollToInput();
  }
  function complete() {
    initialize();
    if (authentication) return;
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
    if (authentication) return;
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
  passwordInput.addEventListener('compositionstart',() => { composing = true; });
  passwordInput.addEventListener('compositionend',() => {
    composing = false;
    if (!authentication || win.dataset.state !== 'open') passwordInput.value = '';
  });
  // A non-password input must explicitly prevent exporting its invisible selection.
  ['copy','cut','dragstart'].forEach(type => passwordInput.addEventListener(type,event => event.preventDefault()));
  passwordInput.addEventListener('keydown',event => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'Enter') { event.preventDefault(); void submitPassword(); }
    else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'c') {
      event.preventDefault(); cancelAuthentication(); focusInput();
    } else if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'l') {
      event.preventDefault(); output.replaceChildren();
    } else if ((event.key === 'Tab' && !event.shiftKey) || ['ArrowUp','ArrowDown'].includes(event.key)) event.preventDefault();
  });
  win.querySelectorAll('[data-terminal-key]').forEach(button => {
    button.addEventListener('pointerdown',event => event.preventDefault());
    button.addEventListener('click',() => {
      focusInput();
      const key = button.dataset.terminalKey;
      if (key === 'complete') complete();
      else if (key === 'clear') output.replaceChildren();
      else recall(key === 'previous' ? -1 : 1);
    });
  });
  screen.addEventListener('click',event => {
    if (event.target === screen && !window.getSelection()?.toString()) focusInput();
  });
  function resizeForKeyboard() {
    const viewport = window.visualViewport;
    const keyboard = !win.hidden && win.dataset.state === 'open' && window.innerWidth <= 760 &&
      [input,passwordInput].includes(document.activeElement) && viewport && viewport.scale === 1 && window.innerHeight - viewport.height > 120;
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
  passwordInput.addEventListener('focus',resizeForKeyboard);
  passwordInput.addEventListener('blur',resizeForKeyboard);
  win.addEventListener('blanktime:window-opened',() => {
    initialize(); focusInput(); resizeForKeyboard(); scrollToInput();
  });
  ['animationend','animationcancel'].forEach(type => win.addEventListener(type,event => {
    if (event.target === win && event.animationName === 'terminal-enter') win.classList.remove('terminal-entering');
  }));
  // End the visual scale before the window manager measures a drag or resize.
  win.addEventListener('pointerdown',() => win.classList.remove('terminal-entering'),{capture:true});
  win.addEventListener('blanktime:window-hidden',event => {
    win.classList.remove('terminal-entering');
    passwordInput.value = '';
    composing = false;
    input.blur(); passwordInput.blur(); resizeForKeyboard();
    if (event.detail?.state !== 'closed') return;
    cancelLoginRequest();
    cancelAuthentication(false);
    shell = null; history = []; historyIndex = 0; draft = ''; composing = false;
    input.value = ''; output.replaceChildren();
    refreshPrompt();
  });
})();
