// 全局搜索：一个居中的搜索面板，同时搜索快捷操作、应用、文章、相册图片与音乐。
// 数据来自虚拟文件系统（文章、图片、音乐）与 Dock（应用），打开方式复用各应用已有的逻辑。
(() => {
  'use strict';
  const root = document.getElementById('spotlight');
  if (!root) return;
  const html = document.documentElement;
  const input = document.getElementById('spotlight-input');
  const list = document.getElementById('spotlight-results');
  const trigger = document.getElementById('desktop-search-button');
  const GROUPS = [['action', '快捷操作'], ['app', '应用'], ['article', '文章'], ['image', '图片'], ['music', '音乐']];
  const LIMIT = {action:4, app:5, article:6, image:5, music:5};
  // 依赖具体内容才能打开的窗口不作为独立应用出现在结果里。
  const EXCLUDED_APPS = new Set(['image-viewer', 'file-details']);
  const ICONS = {
    article:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    music:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    image:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>',
    lock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    desktop:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    theme:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/></svg>',
    wallpaper:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>',
    archive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4zM6 9v10h12V9M10 13h4"/></svg>',
    about:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
  };
  let items = [], rows = [], active = -1, previousFocus = null, popClose = false;
  const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase();
  const terms = query => normalize(query).split(/\s+/).filter(Boolean);
  const desktop = () => window.blanktimeDesktop;
  const open = id => { const win = document.getElementById(id); if (win) desktop()?.openWindow(win); };

  // ---------- 索引：每次打开面板时重建，始终反映当前的应用、歌单与主题状态 ----------
  function summaries() {
    const map = new Map();
    document.querySelectorAll('#browser .browser-card').forEach(card => {
      try { map.set(new URL(card.href, location.href).pathname, card.querySelector('p')?.textContent || ''); } catch {}
    });
    return map;
  }
  function appIcon(button) {
    const art = [...button.children].find(child => !child.classList.contains('running-dot'));
    return art ? art.cloneNode(true) : null;
  }
  function actions() {
    const entries = [];
    if (window.blanktimeLock) entries.push({title:'锁定', keywords:'锁屏 lock 屏保', icon:ICONS.lock, run:() => window.blanktimeLock.lock()});
    if (document.querySelector('.desktop-toggle')) entries.push({title:'显示桌面', keywords:'最小化 全部窗口 desktop', icon:ICONS.desktop, run:() => document.querySelector('.desktop-toggle').click()});
    const appearance = window.blanktimeAppearance;
    if (appearance) {
      const dark = appearance.getTheme() === 'dark';
      entries.push({title:dark ? '切换到浅色模式' : '切换到深色模式', keywords:'外观 主题 暗色 夜间 深色 浅色 dark light theme', icon:ICONS.theme,
        run:() => appearance.setTheme(dark ? 'light' : 'dark')});
    }
    if (document.getElementById('wallpaper-settings')) entries.push({title:'更换壁纸', keywords:'壁纸 背景 wallpaper 锦鲤', icon:ICONS.wallpaper, run:() => open('wallpaper-settings')});
    if (document.querySelector('#browser [data-browser-view="archive"]')) entries.push({title:'文章归档', keywords:'归档 时间线 archive archives', icon:ICONS.archive, run:() => {
      open('browser');
      document.querySelector('#browser .browser-home-button')?.click();
      document.querySelector('#browser [data-browser-view="archive"]')?.click();
    }});
    if (document.getElementById('welcome')) entries.push({title:'关于本站', keywords:'欢迎 介绍 站点 about welcome', icon:ICONS.about, run:() => open('welcome')});
    return entries.map(entry => ({...entry, kind:'action', meta:'快捷操作'}));
  }
  function collect() {
    const result = actions(), seen = new Set();
    document.querySelectorAll('.dock .dock-button[data-open]').forEach(button => {
      const id = button.dataset.open;
      if (seen.has(id) || EXCLUDED_APPS.has(id) || !document.getElementById(id)) return;
      seen.add(id);
      result.push({kind:'app', title:button.getAttribute('aria-label') || button.title || id, meta:'应用', keywords:id, iconNode:appIcon(button), run:() => open(id)});
    });
    const fs = window.blanktimeFS, notes = summaries();
    for (const node of fs?.nodes?.values?.() || []) {
      if (node.type === 'article') {
        let pathname = '';
        try { pathname = new URL(node.url, location.href).pathname; } catch {}
        const date = node.date ? `${node.date.getFullYear()}-${String(node.date.getMonth() + 1).padStart(2, '0')}-${String(node.date.getDate()).padStart(2, '0')}` : '';
        const categories = (node.categories || []).map(category => category.name).filter(Boolean).join(' · ');
        result.push({kind:'article', title:node.title || node.name, meta:[date, categories].filter(Boolean).join(' · '), time:node.date?.valueOf() || 0,
          keywords:[node.search, (node.tags || []).join(' '), notes.get(pathname) || ''].join(' '), encrypted:node.encrypted, icon:ICONS.article,
          run:() => document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href:new URL(node.url, location.href).href}}))});
      } else if (node.type === 'image') {
        result.push({kind:'image', title:node.name, meta:node.parent?.name || '相册', keywords:'', thumb:node.thumbnail || '', icon:ICONS.image,
          run:() => window.blanktimeImages?.open(node.parent.images.map(image => ({...image})), node.imageIndex, {kind:'album', source:node.parent.name})});
      } else if (node.type === 'music') {
        result.push({kind:'music', title:node.title || node.name, meta:node.artist || '音乐', keywords:node.search || '', icon:ICONS.music,
          run:() => window.blanktimeMusic?.playTrack?.(node.trackKey)});
      }
    }
    return result;
  }

  // ---------- 匹配与排序：所有关键词都要命中；标题开头 > 标题中 > 其他字段 ----------
  function score(item, words) {
    const title = normalize(item.title), rest = normalize(`${item.meta} ${item.keywords}`);
    let total = 0;
    for (const word of words) {
      const at = title.indexOf(word);
      if (at === 0) total += 30;
      else if (at > 0) total += 18;
      else if (rest.includes(word)) total += 6;
      else return 0;
    }
    return total + (title === words.join(' ') ? 20 : 0);
  }
  function highlight(text, words) {
    const fragment = document.createDocumentFragment(), lower = normalize(text);
    // 合并所有命中区间，按原文切片，避免任何 HTML 注入。
    const ranges = [];
    for (const word of words) {
      let from = 0, at;
      while (word && (at = lower.indexOf(word, from)) >= 0) { ranges.push([at, at + word.length]); from = at + word.length; }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (end <= cursor) continue;
      const begin = Math.max(start, cursor);
      if (begin > cursor) fragment.append(text.slice(cursor, begin));
      const mark = document.createElement('mark'); mark.textContent = text.slice(begin, end); fragment.append(mark);
      cursor = end;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    return fragment;
  }

  // ---------- 渲染 ----------
  function option(item, words) {
    const row = document.createElement('div');
    row.className = 'spotlight-option';
    row.setAttribute('role', 'option');
    row.id = `spotlight-option-${rows.length}`;
    const icon = document.createElement('span');
    icon.className = 'spotlight-icon';
    if (item.thumb) {
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = item.thumb;
      img.addEventListener('error', () => { icon.innerHTML = ICONS.image; }, {once:true});
      icon.append(img);
    } else if (item.iconNode) icon.append(item.iconNode.cloneNode(true));
    else icon.innerHTML = item.icon || ICONS.more;
    const text = document.createElement('span');
    text.className = 'spotlight-text';
    const title = document.createElement('strong');
    title.append(highlight(item.title, words));
    if (item.encrypted) title.insertAdjacentHTML('beforeend', `<span class="spotlight-lock" aria-label="已加密">${ICONS.lock}</span>`);
    const meta = document.createElement('span');
    meta.textContent = item.meta || '';
    text.append(title, meta);
    const enter = document.createElement('kbd');
    enter.className = 'spotlight-enter'; enter.setAttribute('aria-hidden', 'true'); enter.textContent = '↵';
    row.append(icon, text, enter);
    row.addEventListener('pointermove', () => select(rows.indexOf(row)));
    row.addEventListener('click', () => run(rows.indexOf(row)));
    rows.push(row);
    row.item = item;
    return row;
  }
  function render() {
    const query = input.value.trim(), words = terms(query);
    rows = []; list.replaceChildren();
    let scored;
    if (words.length) {
      scored = items.map(item => ({item, value:score(item, words)})).filter(entry => entry.value > 0)
        .sort((a, b) => b.value - a.value || (b.item.time || 0) - (a.item.time || 0)).map(entry => entry.item);
    } else {
      // 没有输入时：快捷操作与最近的文章。
      scored = [...items.filter(item => item.kind === 'action'),
        ...items.filter(item => item.kind === 'article').sort((a, b) => b.time - a.time)];
    }
    for (const [kind, label] of GROUPS) {
      const group = scored.filter(item => item.kind === kind);
      if (!group.length) continue;
      // 没有输入时快捷操作全部列出，方便直接挑选。
      const shown = group.slice(0, !words.length && kind === 'action' ? group.length : LIMIT[kind]);
      const section = document.createElement('div');
      section.className = 'spotlight-group';
      section.setAttribute('role', 'group');
      const heading = document.createElement('p');
      heading.className = 'spotlight-heading';
      heading.textContent = !words.length && kind === 'article' ? '最近文章' : `${label}${group.length > shown.length ? ` · ${group.length}` : ''}`;
      section.setAttribute('aria-label', heading.textContent);
      section.append(heading, ...shown.map(item => option(item, words)));
      // 文章结果较多时，提供在博客浏览器中查看全部的入口（沿用浏览器的搜索框）。
      if (kind === 'article' && words.length && group.length > shown.length) {
        section.append(option({kind:'more', title:`在博客浏览器中查看全部 ${group.length} 篇`, meta:'打开博客浏览器并按同样的关键词搜索', icon:ICONS.more, run:() => {
          open('browser');
          document.querySelector('#browser .browser-home-button')?.click();
          const field = document.querySelector('#browser .browser-search');
          if (field) { field.value = query; field.dispatchEvent(new Event('input', {bubbles:true})); }
        }}, []));
      }
      list.append(section);
    }
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'spotlight-empty';
      empty.textContent = `没有找到与“${query}”相关的内容。`;
      list.append(empty);
    }
    select(rows.length ? 0 : -1);
  }
  function select(index) {
    active = index;
    rows.forEach((row, at) => row.setAttribute('aria-selected', String(at === index)));
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', rows[index].id);
      rows[index].scrollIntoView?.({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function run(index) {
    const item = rows[index]?.item;
    if (!item) return;
    hide(false);
    item.run();
  }

  // ---------- 打开与关闭 ----------
  function show() {
    if (!root.hidden || window.blanktimeLock?.isLocked?.()) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    items = collect();
    root.hidden = false;
    html.dataset.overlay = 'search';
    input.value = '';
    render();
    input.focus({preventScroll:true});
  }
  function hide(restore = true) {
    if (root.hidden) return;
    root.hidden = true;
    // 由返回键触发时，等返回键逻辑先看到“搜索打开中”再清除标记，避免误关下面的窗口。
    const release = () => { if (root.hidden && html.dataset.overlay === 'search') delete html.dataset.overlay; };
    if (popClose) setTimeout(release); else release();
    if (restore && previousFocus?.isConnected && !previousFocus.closest('[hidden], [inert]')) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }
  const toggle = () => root.hidden ? show() : hide();

  input.addEventListener('input', render);
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!rows.length) return;
      select((active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  });
  root.addEventListener('click', event => { if (event.target.closest('[data-spotlight-close]')) hide(); });
  trigger?.addEventListener('click', toggle);
  // Ctrl+K / ⌘K 随时开关；不在输入框里时“/”也能打开。锁屏期间由锁屏拦截全部按键。
  document.addEventListener('keydown', event => {
    const editable = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggle();
    } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !editable && root.hidden) {
      event.preventDefault();
      show();
    }
  });
  // 焦点移到面板之外（例如点了桌面）时收起。
  document.addEventListener('focusin', event => { if (!root.hidden && !root.contains(event.target)) hide(false); });
  // 手机返回键：先关闭搜索，不关闭下面的窗口（返回键逻辑会把这次返回记为“补回”）。
  addEventListener('popstate', () => {
    if (root.hidden) return;
    popClose = true;
    hide(false);
    popClose = false;
  }, true);
  document.addEventListener('blanktime:lock-change', event => { if (event.detail?.locked) hide(false); });

  window.blanktimeSearch = {open:show, close:hide, toggle, isOpen:() => !root.hidden};
})();
