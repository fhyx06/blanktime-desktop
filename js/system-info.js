(() => {
  'use strict';
  const win = document.getElementById('system-info');
  if (!win) return;
  const fields = Object.fromEntries([...win.querySelectorAll('[data-info]')].map(el => [el.dataset.info, el]));
  const groups = [...win.querySelectorAll('[data-info-group]')];
  const read = (object, key) => { try { return object?.[key]; } catch { return undefined; } };
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const positive = value => number(value) && value > 0;
  const enabled = value => typeof value === 'boolean' ? (value ? '已启用' : '已关闭') : null;
  let active = false, generation = 0, timer, batteryPromise, gpuInfo;
  let listeners = [];

  function set(key, value) {
    const element = fields[key];
    const available = value !== null && value !== undefined && value !== '';
    element.textContent = available ? String(value) : '';
    const row = element.closest('.info-rows > div');
    if (row) row.hidden = !available;
  }
  function syncGroups() {
    groups.forEach(group => { group.hidden = ![...group.querySelectorAll('.info-rows > div')].some(row => !row.hidden); });
  }
  function listen(target, type, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }
  function browserInfo() {
    const ua = read(navigator, 'userAgent') || '';
    const hints = read(navigator, 'userAgentData');
    let platform = read(hints, 'platform');
    if (!platform) {
      platform = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS / iPadOS'
        : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'macOS'
        : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : '未识别的平台';
      // iPad may request the desktop version and report a Mac user agent.
      if (platform === 'macOS' && read(navigator, 'maxTouchPoints') > 1) platform = 'iPadOS（推测）';
    }
    set('platform', platform);
    set('platform-id', read(navigator, 'platform'));
    let browser;
    const brands = read(hints, 'brands');
    if (Array.isArray(brands)) {
      const known = brands.filter(item => /^(Microsoft Edge|Google Chrome|Opera|Brave|Chromium)$/.test(item.brand));
      const selected = known.find(item => !/^(Chromium|Google Chrome)$/.test(item.brand))
        || known.find(item => item.brand === 'Google Chrome') || known[0];
      if (selected) browser = `${selected.brand}${selected.version ? ' ' + selected.version : ''}`;
    }
    if (!browser) {
      const patterns = [
        ['Microsoft Edge', /(?:EdgA|EdgiOS|Edg|Edge)\/([\d.]+)/],
        ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
        ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
        ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
        ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
        ['Safari', /Version\/([\d.]+).*Safari/]
      ];
      for (const [name, pattern] of patterns) {
        const match = ua.match(pattern);
        if (match) { browser = `${name} ${match[1]}`; break; }
      }
    }
    set('browser', browser || '未识别的浏览器');
    set('vendor', read(navigator, 'vendor'));
    set('cookies', enabled(read(navigator, 'cookieEnabled')));
    const dnt = read(navigator, 'doNotTrack') ?? read(window, 'doNotTrack');
    set('dnt', dnt === '1' || dnt === 'yes' ? '已开启' : dnt === '0' || dnt === 'no' ? '已关闭'
      : 'doNotTrack' in navigator || 'doNotTrack' in window ? '未设置' : '未提供');
  }
  function clock() {
    const now = new Date();
    set('time', new Intl.DateTimeFormat('zh-CN', {
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).format(now));
    fields.time.dateTime = now.toISOString();
    try { set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { set('timezone', null); }
  }
  function display() {
    const screen = read(window, 'screen');
    const size = (width, height) => positive(width) && positive(height) ? `${width} × ${height} px` : null;
    set('screen', size(read(screen, 'width'), read(screen, 'height')));
    set('available-screen', size(read(screen, 'availWidth'), read(screen, 'availHeight')));
    set('viewport', size(window.innerWidth, window.innerHeight));
    const dpr = read(window, 'devicePixelRatio');
    set('dpr', positive(dpr) ? Number(dpr.toFixed(3)) : null);
    for (const [key, property] of [['color-depth','colorDepth'], ['pixel-depth','pixelDepth']]) {
      const depth = read(screen, property);
      set(key, positive(depth) ? `${depth} bit` : null);
    }
    syncGroups();
  }
  function language() {
    set('language', read(navigator, 'language'));
    const languages = read(navigator, 'languages');
    set('languages', Array.isArray(languages) ? languages.filter(item => typeof item === 'string').join(' · ') : null);
    const touches = read(navigator, 'maxTouchPoints');
    set('touch', Number.isInteger(touches) && touches >= 0 ? (touches ? `最多 ${touches} 点触控` : '不支持触控') : null);
    syncGroups();
  }
  function network() {
    const online = read(navigator, 'onLine');
    set('online', typeof online === 'boolean' ? (online ? '在线' : '离线') : null);
    fields.online.dataset.online = String(online);
    const connection = read(navigator, 'connection');
    const types = {wifi:'Wi-Fi', ethernet:'以太网', cellular:'移动网络', bluetooth:'蓝牙', wimax:'WiMAX', none:'无连接'};
    set('connection-type', types[read(connection, 'type')]);
    const quality = {'slow-2g':'低于 2G 级别', '2g':'2G 级别', '3g':'3G 级别', '4g':'4G 级别'};
    set('effective-type', quality[read(connection, 'effectiveType')]);
    const downlink = read(connection, 'downlink'), rtt = read(connection, 'rtt');
    set('downlink', number(downlink) && downlink >= 0 ? `${downlink} Mbps` : null);
    set('rtt', number(rtt) && rtt >= 0 ? `${rtt} ms` : null);
    set('save-data', enabled(read(connection, 'saveData')));
    syncGroups();
  }
  function hardware() {
    const cpu = read(navigator, 'hardwareConcurrency');
    set('cpu', Number.isInteger(cpu) && cpu > 0 ? `${cpu} 个` : null);
    if (!gpuInfo) {
      gpuInfo = {};
      let gl;
      try {
        const canvas = document.createElement('canvas');
        gl = canvas.getContext('webgl');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        if (debug) {
          gpuInfo.vendor = gl.getParameter(debug.UNMASKED_VENDOR_WEBGL);
          gpuInfo.renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
        }
      } catch { /* Some browsers disable WebGL or renderer information. */ }
      finally { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
    }
    set('gpu-vendor', typeof gpuInfo.vendor === 'string' ? gpuInfo.vendor : null);
    set('gpu', typeof gpuInfo.renderer === 'string' ? gpuInfo.renderer : null);
    syncGroups();
  }
  function battery(run) {
    if (typeof read(navigator, 'getBattery') !== 'function') return;
    // Share a pending request across reopenings; a late response must not restart a hidden window.
    batteryPromise ||= Promise.resolve().then(() => navigator.getBattery()).catch(() => null);
    batteryPromise.then(manager => {
      if (!manager || !active || run !== generation) return;
      const update = () => {
        const level = read(manager, 'level');
        const valid = number(level) && level >= 0 && level <= 1;
        set('battery', valid ? `${Math.round(level * 100)}%` : null);
        if (valid) document.getElementById('info-battery-level').value = level;
        const charging = read(manager, 'charging');
        set('charging', typeof charging === 'boolean' ? (charging ? '正在充电或已接通电源' : '未充电') : null);
        syncGroups();
      };
      update();
      listen(manager, 'levelchange', update);
      listen(manager, 'chargingchange', update);
    });
  }
  function start() {
    if (active) return;
    active = true;
    const run = ++generation;
    browserInfo(); clock(); display(); language(); network(); hardware(); battery(run);
    timer = setInterval(clock, 1000);
    listen(window, 'resize', display);
    listen(window, 'languagechange', language);
    listen(window, 'online', network);
    listen(window, 'offline', network);
    listen(read(navigator, 'connection'), 'change', network);
    if (typeof window.matchMedia === 'function') {
      const fine = matchMedia('(any-pointer: fine)'), coarse = matchMedia('(any-pointer: coarse)'), hover = matchMedia('(any-hover: hover)');
      const input = () => {
        set('pointer', [fine.matches && '精细指针', coarse.matches && '粗略指针'].filter(Boolean).join(' · ') || '无指针');
        set('hover', hover.matches ? '支持悬停' : '不支持悬停');
        syncGroups();
      };
      input();
      [fine, coarse, hover].forEach(media => listen(media, 'change', input));
    }
  }
  function stop() {
    active = false;
    ++generation;
    clearInterval(timer);
    listeners.forEach(remove => remove());
    listeners = [];
  }
  function sync() {
    if (win.dataset.state === 'open' && !document.hidden) start();
    else stop();
  }
  new MutationObserver(sync).observe(win, {attributes:true, attributeFilter:['data-state']});
  win.addEventListener('blanktime:window-hidden', stop);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', sync);
  sync();
})();
