(() => {
  let config = {};
  try {
    const value = JSON.parse(document.getElementById('context-menu-config')?.textContent || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) config = value;
  } catch {}
  if (config.enable === false) return;
  const menu = document.createElement('div');
  menu.className = 'context-menu'; menu.hidden = true;
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '快捷操作');
  const notice = document.createElement('div');
  notice.className = 'context-menu-notice'; notice.hidden = true; notice.setAttribute('role', 'status');
  document.body.append(menu, notice);
  let origin = null, focusOrigin = null, noticeTimer, stopMusic;
  const observer = new MutationObserver(() => { if (!visible(origin)) close(); });
  const $ = selector => document.querySelector(selector);
  const item = (id, label, run, disabled = false) => ({id, label, run, disabled});
  const visible = element => element?.isConnected && !element.closest('[hidden], [inert]');
  function close(restoreFocus = false) {
    if (menu.hidden) return;
    observer.disconnect();
    stopMusic?.(); stopMusic = null;
    menu.hidden = true;
    if (restoreFocus && visible(focusOrigin)) focusOrigin.focus({preventScroll:true});
    origin = focusOrigin = null;
  }
  function notify(message) {
    (document.fullscreenElement || document.body).append(notice);
    notice.textContent = message; notice.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 2500);
  }
  async function copy(text) {
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
    // Clipboard API is unavailable on HTTP LAN previews; retain a user-gesture fallback.
    if (!copied) {
      const active = document.activeElement;
      const field = document.createElement('textarea'); field.value = text;
      field.setAttribute('aria-label', '复制地址'); field.style.cssText = 'position:fixed;left:-10000px;top:0;';
      (document.fullscreenElement || document.body).append(field); field.select();
      try { copied = document.execCommand('copy'); } catch {}
      field.remove(); if (visible(active)) active.focus({preventScroll:true});
    }
    notify(copied ? '已复制链接' : '复制失败，请使用浏览器原生菜单复制');
  }
  function copyItem(label, value) {
    let url = '';
    try { if (value) { const parsed = new URL(value, location.href); if (/^https?:$/.test(parsed.protocol)) url = parsed.href; } } catch {}
    return item('copy-link', label, () => copy(url), !url);
  }
  function buttonItem(id, label, button) {
    return item(id, label, () => { if (visible(button) && !button.disabled) button.click(); }, !visible(button) || button.disabled);
  }
  function openApp(id) { const win = document.getElementById(id); if (win) window.blanktimeDesktop.openWindow(win); }
  function systemThemeLabel() { return window.blanktimeAppearance.getTheme() === 'dark' ? '切换到浅色模式' : '切换到深色模式'; }
  function renderMusic() {
    const player = window.blanktimeMusic;
    const panel = document.createElement('div'); panel.className = 'context-music';
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '音乐播放');
    // Static UI only; song metadata is assigned through textContent below.
    panel.innerHTML = '<button type="button" role="menuitem" tabindex="-1" class="context-music-now" data-action="music-open" aria-label="打开音乐播放器" title="打开音乐播放器"><span class="context-music-cover" aria-hidden="true"><span>♪</span><img alt="" hidden></span><span class="context-music-meta"><strong></strong><span></span></span></button><div class="context-music-progress" aria-hidden="true"><i></i></div><div class="context-music-bottom"><span class="context-music-time" aria-hidden="true"></span><div class="context-music-controls"><button type="button" role="menuitem" tabindex="-1" data-action="music-prev" aria-label="上一首" title="上一首"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5l-10 7 10 7Z"/></svg></button><button type="button" role="menuitem" tabindex="-1" data-action="music-play" aria-label="播放" title="播放"></button><button type="button" role="menuitem" tabindex="-1" data-action="music-next" aria-label="下一首" title="下一首"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M5 5l10 7-10 7Z"/></svg></button></div></div>';
    const art = panel.querySelector('img'), title = panel.querySelector('strong'), artist = panel.querySelector('.context-music-meta > span');
    const play = panel.querySelector('[data-action="music-play"]'), opener = panel.querySelector('[data-action="music-open"]');
    const format = seconds => {
      const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    };
    art.addEventListener('load', () => { art.hidden = false; });
    art.addEventListener('error', () => { art.hidden = true; });
    function update() {
      const state = player.getState();
      title.textContent = state.title || (state.loading ? '正在加载歌单…' : state.loadState === 'error' ? '歌单加载失败' : '音乐播放器');
      artist.textContent = state.loading ? '正在加载歌单…' : !state.ready ? '打开播放器查看' : state.artist || '选择一首歌';
      title.title = title.textContent; artist.title = artist.textContent;
      const cover = /^https?:\/\//i.test(state.cover || '') ? state.cover : '';
      if (cover !== (art.getAttribute('src') || '')) {
        art.hidden = true;
        if (cover) art.src = cover; else art.removeAttribute('src');
      }
      const label = state.playing ? '暂停' : '播放';
      if (play.getAttribute('aria-label') !== label || !play.firstChild) {
        play.setAttribute('aria-label', label); play.title = label;
        play.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${state.playing ? '<path d="M8 5v14M16 5v14"/>' : '<path d="m8 5 11 7-11 7Z"/>'}</svg>`;
      }
      panel.querySelectorAll('.context-music-controls button').forEach(button => { button.disabled = !state.ready; });
      if (panel.contains(document.activeElement) && document.activeElement.disabled) opener.focus({preventScroll:true});
      const percent = state.duration > 0 ? Math.max(0, Math.min(100, state.currentTime / state.duration * 100)) : 0;
      panel.querySelector('.context-music-progress i').style.width = `${percent}%`;
      panel.querySelector('.context-music-time').textContent = `${format(state.currentTime)} / ${format(state.duration)}`;
    }
    opener.addEventListener('click', () => { close(true); player.open(); });
    for (const [id, action] of [['prev', 'previous'], ['play', 'togglePlayback'], ['next', 'next']]) {
      panel.querySelector(`[data-action="music-${id}"]`).addEventListener('click', () => {
        if (!visible(origin)) { close(); return; }
        player[action]();
        if (!menu.hidden) update();
      });
    }
    update();
    document.addEventListener('blanktime:music-state', update);
    stopMusic = () => document.removeEventListener('blanktime:music-state', update);
    return panel;
  }
  function windowItems(win) {
    const state = win.dataset.state || (win.hidden ? 'closed' : 'open');
    const entries = [item('open', state === 'minimized' ? '恢复窗口' : state === 'open' ? '显示窗口' : '打开应用', () => openApp(win.id))];
    if (state === 'open') {
      entries.push(buttonItem('minimize', '最小化', win.querySelector('[data-action="minimize"]')));
      if (!matchMedia('(max-width: 760px)').matches && !document.fullscreenElement) {
        entries.push(buttonItem('maximize', win.classList.contains('is-maximized') ? '还原窗口' : '最大化', win.querySelector('[data-action="maximize"]')));
      }
    }
    if (state !== 'closed') entries.push(null, item('close', '关闭窗口', () => window.blanktimeDesktop.closeWindow(win)));
    return entries;
  }
  function context(target) {
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), pre, code, audio, video, iframe')) return null;
    const app = target.closest('.desktop-file-icon, .dock-button[data-open]');
    if (app) {
      const win = document.getElementById(app.id === 'desktop-files' ? 'files' : app.dataset.open);
      return win ? {group:'window', items:windowItems(win)} : null;
    }
    const row = target.closest('.post-file, .browser-card');
    if (row) {
      const link = row.matches('a[href]') ? row : row.querySelector('a[href]');
      if (!link) return null;
      const href = link.href;
      return {group:'article_item', select:() => { if (row.matches('.post-file')) window.blanktimeDesktop.selectFile(row); }, items:[
        item('open-article', '打开文章', () => document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href}}))),
        copyItem('复制文章链接', href)
      ]};
    }
    const card = target.closest('.album-card');
    if (card) return {group:'album_image', items:[
      item('view-image', card.dataset.loadState === 'error' && card.dataset.thumbnailMode !== 'true' ? '重新加载图片' : '查看大图', () => card.click()),
      copyItem('复制图片地址', card.dataset.src)
    ]};
    const folder = target.closest('.album-folder');
    if (folder) return {group:'album_folder', items:[item('open-folder', '打开文件夹', () => folder.click())]};
    const image = target.closest('img.image-viewer-trigger');
    if (image) return {group:'article_image', items:[
      item('view-image', '查看大图', () => image.click()),
      copyItem('复制图片地址', image.closest('a[href]')?.href || image.currentSrc || image.src)
    ]};
    if (target.closest('#image-viewer-stage')) {
      const photo = $('#image-viewer-stage img');
      const entries = [buttonItem('fit', '适应窗口', $('#image-viewer-fit')), buttonItem('actual', '实际大小（100%）', $('#image-viewer-actual'))];
      if (photo) entries.push(copyItem('复制图片地址', photo.currentSrc || photo.src));
      if (!$('#image-viewer-retry').hidden) entries.push(buttonItem('retry', '重新加载图片', $('#image-viewer-retry')));
      entries.push(null, buttonItem('fullscreen', document.fullscreenElement ? '退出全屏' : '全屏查看', $('#image-viewer-fullscreen')));
      if (!$('#image-viewer-wallpaper').hidden) entries.push(buttonItem('wallpaper', '设为壁纸', $('#image-viewer-wallpaper')));
      return {group:'image_viewer', items:entries};
    }
    // Keep native actions for ordinary links, controls and selections.
    if (target.closest('a[href], button, [role="button"], img')) return null;
    const titlebar = target.closest('.titlebar');
    if (titlebar) return {group:'window', items:windowItems(titlebar.closest('.app-window'))};
    const article = target.closest('[data-article]');
    if (article) {
      const toc = $('.browser-toc-button'), theme = $('.browser-theme-button');
      return {group:'article', items:[
        copyItem('复制文章链接', article.dataset.url), null,
        buttonItem('toc', toc?.getAttribute('aria-expanded') === 'true' ? '隐藏目录' : '显示目录', toc),
        buttonItem('reader-theme', theme?.getAttribute('aria-label') || '切换阅读主题', theme),
        buttonItem('article-home', '返回文章列表', $('.browser-home-button'))
      ]};
    }
    if (target.matches('body, html, .wallpaper, .desktop, .desktop-status, .desktop-status *')) {
      const anyOpen = [...document.querySelectorAll('.app-window')].some(win => win.dataset.state === 'open');
      return {group:'desktop', items:[
        ...(window.blanktimeMusic ? [{...item('music-player', '音乐播放器'), kind:'music'}, null] : []),
        item('files', '文件管理', () => openApp('files')),
        item('browser', '博客浏览器', () => openApp('browser')),
        item('album', '相册', () => openApp('album')),
        ...($('#terminal') ? [item('terminal', '终端', () => openApp('terminal'))] : []), null,
        ...(anyOpen ? [buttonItem('desktop', '显示桌面', $('.desktop-toggle'))] : []),
        // Settings actions are available even while their panel is hidden.
        item('wallpapers', '更换壁纸', () => $('#settings-wallpaper-toggle').click()),
        item('system-info', '基础信息', () => openApp('system-info')),
        ...(window.blanktimeAppearance ? [item('system-theme', systemThemeLabel(), () => {
          const appearance = window.blanktimeAppearance;
          appearance.setTheme(appearance.getTheme() === 'dark' ? 'light' : 'dark');
        })] : []),
        item('settings', '设置', () => { if ($('#settings-panel').hidden) $('#settings-toggle').click(); })
      ]};
    }
    return null;
  }
  function configuredItems(result) {
    const group = config[result.group];
    if (group?.enable === false) return [];
    const entries = [];
    let separator = false;
    for (const entry of result.items) {
      if (!entry) { separator = entries.length > 0; continue; }
      if (group?.[entry.id.replace(/-/g, '_')] === false) continue;
      if (separator) entries.push(null);
      entries.push(entry); separator = false;
    }
    return entries;
  }
  function show(target, x, y) {
    close();
    if (!(target instanceof Element) || !visible(target) || window.getSelection()?.toString()) return false;
    const result = context(target); if (!result?.items.length) return false;
    const entries = configuredItems(result); if (!entries.length) return false;
    result.select?.(); origin = target;
    focusOrigin = target.closest('a[href], button, [tabindex]') || target.querySelector('a[href]') || target.closest('.app-window') || document.activeElement;
    const owner = target.closest('.app-window');
    menu.dataset.theme = owner?.dataset.theme || document.documentElement.dataset.systemTheme || 'light';
    (document.fullscreenElement || document.body).append(menu);
    menu.replaceChildren();
    menu.classList.toggle('has-music', entries.some(entry => entry?.kind === 'music'));
    for (const entry of entries) {
      if (!entry) { const line = document.createElement('div'); line.setAttribute('role', 'separator'); menu.append(line); continue; }
      if (entry.kind === 'music') { menu.append(renderMusic()); continue; }
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.setAttribute('role', 'menuitem'); button.dataset.action = entry.id; button.textContent = entry.label; button.disabled = entry.disabled;
      button.addEventListener('click', () => {
        const connected = visible(origin);
        close(true);
        if (connected && !entry.disabled) entry.run();
      });
      menu.append(button);
    }
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    // Observe only while open: tab switches or asynchronous rendering can remove the target.
    observer.observe($('.desktop'), {subtree:true, childList:true, attributes:true, attributeFilter:['hidden', 'inert']});
    return true;
  }
  function allowCustom(event) { return !event.defaultPrevented && event.pointerType !== 'touch' && !matchMedia('(hover: none)').matches; }
  document.addEventListener('contextmenu', event => {
    if (!allowCustom(event) || event.shiftKey || event.ctrlKey) { close(); return; }
    if (menu.contains(event.target)) { event.preventDefault(); return; }
    const bounds = event.target.getBoundingClientRect?.();
    const x = event.clientX || bounds?.left + 16 || 8, y = event.clientY || bounds?.top + 16 || 8;
    if (show(event.target, x, y)) event.preventDefault();
  });
  // Capture prevents Escape/arrow keys from also reaching the album and image viewer.
  document.addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      if (!allowCustom(event)) return;
      const target = event.target, bounds = target.getBoundingClientRect?.();
      if (show(target, (bounds?.left || 0) + 16, (bounds?.top || 0) + 16)) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (menu.hidden) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation(); close(true); return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[index].focus({preventScroll:true});
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopImmediatePropagation(); document.activeElement?.closest('.context-menu button')?.click();
    }
  }, true);
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); }, true);
  document.addEventListener('focusin', event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) close(true); }, true);
  document.addEventListener('blanktime:window-hidden', () => close(), true);
  document.addEventListener('fullscreenchange', () => close());
  document.addEventListener('blanktime:system-theme', () => {
    if (menu.hidden) return;
    menu.dataset.theme = origin?.closest('.app-window')?.dataset.theme || document.documentElement.dataset.systemTheme || 'light';
    const toggle = menu.querySelector('[data-action="system-theme"]');
    if (toggle) toggle.textContent = systemThemeLabel();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  window.addEventListener('resize', () => close(true));
  window.addEventListener('blur', () => close());
  window.addEventListener('popstate', () => close());
})();
