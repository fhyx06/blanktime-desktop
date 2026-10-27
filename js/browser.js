(() => {
  'use strict';
  const win = document.getElementById('browser');
  if (!win) return;
  const $ = selector => win.querySelector(selector);
  const bar = $('.browser-tabs'), pages = $('.browser-pages'), status = $('.browser-status');
  const themeButton = $('.browser-theme-button'), tocButton = $('.browser-toc-button');
  const cards = [...win.querySelectorAll('.browser-card')];
  const posts = new Map(cards.map(card => [new URL(card.href).pathname, card]));
  const tabs = new Map();
  let active, sequence = 0;
  const homePath = document.body.dataset.home;
  const siteTitle = document.title.split(' · ').pop();
  function route(tab, hash = '', replace = false) {
    const path = tab.key === 'home' ? homePath : tab.key + hash;
    if (location.pathname + location.hash !== path) history[replace ? 'replaceState' : 'pushState']({}, '', path);
    document.title = tab.key === 'home' ? siteTitle : tab.title + ' · ' + siteTitle;
  }
  const screenMode = matchMedia('(max-width:760px)');
  const tocKey = () => 'blanktime-reader-toc-' + (screenMode.matches ? 'mobile' : 'desktop');
  function readToc() { try { return (localStorage.getItem(tocKey()) ?? String(!screenMode.matches)) === 'true'; } catch { return !screenMode.matches; } }
  let tocVisible = readToc();
  function setToc(visible) { tocVisible = visible; try { localStorage.setItem(tocKey(), String(visible)); } catch {} updateTools(); }
  let theme = window.blanktimeAppearance.getTheme();
  function applyTheme() {
    win.dataset.theme = theme;
    tabs.forEach(tab => tab.comments?.setTheme(theme));
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    themeButton.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    themeButton.title = themeButton.getAttribute('aria-label');
  }
  applyTheme();
  document.addEventListener('blanktime:system-theme', event => { theme = event.detail.theme; applyTheme(); });
  themeButton.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark'; applyTheme();
    // The toolbar adjusts this reading session; the system preference stays unchanged.
  });
  function suspend(tab) {
    tab.comments?.setActive(false);
    tab.article?.querySelectorAll('audio,video').forEach(media => media.pause());
    tab.article?.querySelectorAll('iframe').forEach(frame => {
      const placeholder = document.createElement('template');
      tab.frames.push({placeholder, frame: frame.cloneNode(true)});
      frame.replaceWith(placeholder);
    });
  }
  function resume(tab) {
    tab.frames.forEach(({placeholder, frame}) => placeholder.replaceWith(frame));
    tab.frames = [];
    tab.comments?.setActive(true);
  }
  function updateTools() {
    const article = active !== home;
    tocButton.disabled = !article || !active.toc;
    tocButton.setAttribute('aria-expanded', String(article && !!active.toc && tocVisible));
    tocButton.setAttribute('aria-label', tocVisible ? '隐藏目录' : '显示目录');
    tocButton.title = tocButton.getAttribute('aria-label');
    if (active.toc) {
      active.toc.hidden = !tocVisible;
      active.toc.classList.toggle('is-open', tocVisible);
    }
    // The desktop address describes the shared file tree; real article URLs still
    // drive navigation, fetching, relative assets and comment identity.
    const filesystem = window.blanktimeFS;
    const filePath = article ? filesystem?.articlePath?.(active.url?.href || active.key)
      : filesystem?.home ? filesystem.home + '/Documents/Posts/' : null;
    const address = $('.browser-location');
    address.textContent = filePath ? 'http://127.0.0.1' + filePath
      : article ? '空白时间 / ' + active.title : '空白时间 / 所有文章';
    address.title = address.textContent;
    status.textContent = article ? (active.summary || '正在加载文章…') : `共 ${cards.filter(card => !card.hidden).length} 篇文章`;
  }
  function activate(tab, focus = true, navigate = true) {
    if (active && active !== tab) {
      window.blanktimeDesktop.settleWindowMotion?.(win);
      suspend(active);
    }
    active = tab;
    if (navigate) route(tab, tab.url?.hash || "");
    tabs.forEach(item => {
      item.page.hidden = item !== tab;
      item.button.setAttribute('aria-selected', String(item === tab));
      item.button.tabIndex = item === tab ? 0 : -1;
    });
    if (!win.hidden && win.dataset.state === 'open') resume(tab);
    updateTools();
    if (focus) { tab.button.focus(); tab.button.scrollIntoView({block:'nearest', inline:'nearest'}); }
  }
  function createTab(key, title, page, closable = true) {
    const id = `browser-tab-${++sequence}`;
    const wrap = document.createElement('div'); wrap.className = 'browser-tab-wrap';
    const button = document.createElement('button'); button.className = 'browser-tab'; button.type = 'button';
    button.id = id; button.textContent = title; button.title = title; button.setAttribute('role', 'tab');
    page.id = `${id}-panel`; page.setAttribute('role', 'tabpanel'); page.setAttribute('aria-labelledby', id);
    button.setAttribute('aria-controls', page.id);
    const tab = {key, title, page, button, wrap, frames:[], prefix: id + '-', controller: new AbortController()};
    wrap.append(button); bar.append(wrap); tabs.set(key, tab);
    button.addEventListener('click', () => activate(tab));
    button.addEventListener('keydown', event => {
      const list = [...tabs.values()], index = list.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % list.length : event.key === 'ArrowLeft' ? (index - 1 + list.length) % list.length : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); activate(list[next]); }
      if (event.key === 'Delete' && closable) { event.preventDefault(); close(tab); }
    });
    if (closable) {
      const remove = document.createElement('button'); remove.className = 'browser-close-tab'; remove.textContent = '×';
      remove.setAttribute('aria-label', `关闭标签：${title}`); remove.addEventListener('click', () => close(tab)); wrap.append(remove);
    }
    return tab;
  }
  function close(tab) {
    const list = [...tabs.values()], index = list.indexOf(tab);
    suspend(tab); tab.controller.abort(); tab.observer?.disconnect(); tabs.delete(tab.key);
    tab.comments?.destroy();
    tab.wrap.remove(); tab.page.remove(); tab.frames = [];
    if (active === tab) activate(list[index - 1] || home);
  }
  const home = createTab('home', '文章首页', $('.browser-home'), false);
  activate(home, false, false);
  $('.browser-home-button').addEventListener('click', () => activate(home));
  tocButton.addEventListener('click', () => { setToc(!tocVisible); });
  screenMode.addEventListener('change', () => { tocVisible = readToc(); updateTools(); });
  $('.browser-search').addEventListener('input', event => {
    window.blanktimeDesktop.settleWindowMotion?.(win);
    const query = event.target.value.trim().toLocaleLowerCase();
    cards.forEach(card => { card.hidden = !card.textContent.toLocaleLowerCase().includes(query); });
    $('.browser-empty').hidden = cards.some(card => !card.hidden); updateTools();
  });
  win.querySelectorAll('.browser-cover img').forEach(img => {
    const fallback = () => { img.hidden = true; };
    img.addEventListener('error', fallback);
    if (img.complete && !img.naturalWidth) fallback();
  });
  function openArticle(url, title, source = null, {navigate = true, focus = true, animate = true} = {}) {
    let tab = tabs.get(url.pathname);
    if (!tab) {
      const page = document.createElement('div'); page.className = 'browser-page browser-article-page reading-layout'; pages.append(page);
      tab = createTab(url.pathname, title, page);
      tab.url = url; load(tab, source);
    }
    tab.url = url;
    // Choose the destination before startup snapshots the currently visible page.
    activate(tab, false, navigate);
    window.blanktimeDesktop.openWindow(win, focus, {animate});
    if (focus) tab.button.focus({preventScroll:true});
    tab.button.scrollIntoView({block:'nearest', inline:'nearest'});
    if (url.hash && tab.article) jump(tab, url.hash);
  }
  function jump(tab, hash) {
    try {
      // Footnote IDs may themselves contain percent-encoded labels.
      const raw = hash.slice(1);
      const ids = [raw];
      try { ids.push(decodeURIComponent(raw)); } catch {}
      const target = [...tab.article.querySelectorAll('[id]')].find(el => ids.some(id => el.id === tab.prefix + id || el.id === id));
      if (target) {
        target.scrollIntoView({block:'start'});
        // Keep keyboard navigation at the destination when following a footnote.
        if (target.matches('[data-footnote-ref], .footnotes li')) {
          if (!target.matches('a[href]') && !target.hasAttribute('tabindex')) target.tabIndex = -1;
          target.focus({preventScroll:true});
        }
      }
    } catch {}
  }
  function prepareContent(tab, root) {
    // Decrypted content arrives later and needs the same tab-local IDs/URLs.
    if (root.id) root.id = tab.prefix + root.id;
    root.querySelectorAll('[id]').forEach(node => { node.id = tab.prefix + node.id; });
    for (const attribute of ['aria-controls','aria-labelledby','aria-describedby','for']) {
      root.querySelectorAll(`[${attribute}]`).forEach(node => node.setAttribute(attribute, node.getAttribute(attribute).split(/\s+/).map(id => tab.prefix + id).join(' ')));
    }
    root.querySelectorAll('[src],a[href]').forEach(node => {
      const attr = node.hasAttribute('src') ? 'src' : 'href', value = node.getAttribute(attr);
      if (value && !value.startsWith('#')) {
        try { node.setAttribute(attr, new URL(value, tab.url).href); } catch {}
      }
    });
    root.querySelectorAll('a[href]').forEach(link => {
      try {
        const url = new URL(link.href);
        if (!link.getAttribute('href').startsWith('#') && (url.origin !== location.origin || !posts.has(url.pathname))) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      } catch {}
    });
  }
  function renderContent(tab) {
    if (tab.ready) return;
    tab.ready = true;
    const article = tab.article, scroll = tab.scroll;
    const toc = document.createElement('aside'); toc.className = 'toc-panel'; toc.setAttribute('aria-label','文章目录');
    const label = document.createElement('div'); label.className = 'toc-heading'; label.textContent = '本文目录';
    const nav = document.createElement('nav'); nav.className = 'browser-toc'; toc.append(label, nav); tab.toc = toc;
    const plain = article.querySelector('.post-content').cloneNode(true); plain.querySelectorAll('.katex-mathml').forEach(node => node.remove());
    const count = (plain.textContent.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+/g) || []).length;
    tab.summary = `${count.toLocaleString()} 字 · 约 ${Math.max(1, Math.ceil(count / 400))} 分钟`;
    tab.page.append(toc);
    const headings = [...article.querySelectorAll('.post-content :is(h1,h2,h3,h4,h5,h6)')];
    const links = [], minLevel = Math.min(...headings.map(h => Number(h.tagName.slice(1))));
    function progress() {
      if (active !== tab) return;
      const max = scroll.scrollHeight - scroll.clientHeight;
      const percentage = max <= 1 ? 100 : Math.min(100, Math.round(scroll.scrollTop / max * 100));
      status.textContent = `${tab.summary} · 已读 ${percentage}%`;
      let index = 0; const boundary = scroll.getBoundingClientRect().top + 90;
      headings.forEach((heading, i) => { if (heading.getBoundingClientRect().top <= boundary) index = i; });
      links.forEach((link, i) => { link.classList.toggle('active', i === index); if (i === index) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); });
    }
    tab.progress = progress;
    window.blanktimeImages.prepareArticle(article);
    window.blanktimeReading.setupCodeBlocks(article, tab.prefix, progress);
    headings.forEach((heading, i) => {
      if (!heading.id) heading.id = `${tab.prefix}section-${i}`;
      const link = document.createElement('a'); link.href = '#' + encodeURIComponent(heading.id); link.textContent = heading.textContent;
      link.style.setProperty('--level', Math.min(4, Number(heading.tagName.slice(1)) - minLevel));
      link.addEventListener('click', event => {
        event.preventDefault(); heading.scrollIntoView({block:'start'});
        tab.url.hash = '#' + encodeURIComponent(heading.id.slice(tab.prefix.length));
        route(tab, tab.url.hash, true);
        if (matchMedia('(max-width:760px)').matches) { setToc(false); }
      }); nav.append(link); links.push(link);
    });
    if (!headings.length) nav.textContent = '这篇文章没有章节标题';
    article.querySelectorAll('.legacy-tabs').forEach(group => {
      const buttons = [...group.querySelectorAll('[role=tab]')], panels = [...group.querySelectorAll('[role=tabpanel]')];
      const select = index => buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(index === i)); button.tabIndex = index === i ? 0 : -1; panels[i].hidden = index !== i; });
      group.classList.add('is-enhanced'); select(0);
      buttons.forEach((button, i) => {
        button.addEventListener('click', () => { select(i); progress(); });
        button.addEventListener('keydown', event => {
          const index = event.key === 'ArrowRight' ? (i + 1) % buttons.length : event.key === 'ArrowLeft' ? (i - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
          if (index >= 0) { event.preventDefault(); select(index); buttons[index].focus(); }
        });
      });
    });
    article.querySelectorAll('img,iframe').forEach(node => { node.loading = 'lazy'; });
    tab.comments = window.blanktimeComments?.create({article, scroll, theme});
    tab.comments?.setActive(active === tab && !win.hidden && win.dataset.state === 'open');
    scroll.addEventListener('scroll', progress, {passive:true});
    tab.observer = new ResizeObserver(progress); tab.observer.observe(scroll);
    if (active !== tab || win.hidden || win.dataset.state === 'closed') suspend(tab);
    if (active === tab) { updateTools(); progress(); if (tab.url.hash) jump(tab, tab.url.hash); }
  }
  async function load(tab, initialSource = null) {
    tab.comments?.destroy(); tab.comments = null;
    tab.observer?.disconnect(); tab.toc = null; tab.article = null; tab.progress = null; tab.ready = false;
    tab.page.replaceChildren(); tab.page.setAttribute('aria-busy', 'true');
    const message = document.createElement('div'); message.className = 'browser-message'; message.textContent = '正在加载文章…'; tab.page.append(message);
    try {
      let source = initialSource;
      if (!source) {
        const response = await fetch(tab.url.href, {signal:tab.controller.signal});
        if (!response.ok) throw new Error('Request failed');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        source = doc.getElementById('article-source')?.content.querySelector('[data-article]');
      }
      if (!source) throw new Error('Missing article');
      if (!tabs.has(tab.key)) return;
      const article = document.importNode(source, true); tab.article = article;
      article.dataset.url = new URL(tab.url.pathname + tab.url.search, tab.url).href;
      const locked = window.blanktimeEncryption?.prepare(article) || article.dataset.encrypted === 'true';
      prepareContent(tab, article);
      const scroll = document.createElement('div'); scroll.className = 'article-scroll'; scroll.tabIndex = 0; scroll.setAttribute('aria-label','文章正文'); scroll.append(article);
      tab.scroll = scroll;
      tab.page.replaceChildren(scroll);
      window.blanktimeReading.setupArticleHeader(article, () => tab.progress?.());
      if (locked) {
        tab.summary = '加密文章 · 请输入密码';
        window.blanktimeEncryption?.mount(article, {
          signal:tab.controller.signal,
          onUnlock: content => {
            if (!tabs.has(tab.key) || tab.controller.signal.aborted) return;
            prepareContent(tab, content);
            renderContent(tab);
          }
        });
        if (active === tab) updateTools();
      } else renderContent(tab);
    } catch (error) {
      if (error.name === 'AbortError') return;
      tab.page.replaceChildren(message);
      message.textContent = '文章加载失败，请检查连接后重试。';
      const retry = document.createElement('button'); retry.textContent = '重试'; retry.addEventListener('click', () => load(tab)); message.append(document.createElement('br'), retry);
      tab.summary = '文章加载失败'; if (active === tab) updateTools();
    } finally { tab.page.removeAttribute('aria-busy'); }
  }
  // Article links share the same tabbed reading surface.
  win.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.closest('.browser-toc,.article-comments') || event.defaultPrevented) return;
    const href = link.getAttribute('href');
    if (href.startsWith('#') && active.article) { event.preventDefault(); event.stopPropagation(); jump(active, href); active.url.hash = href; route(active, href, true); return; }
    let url; try { url = new URL(link.href); } catch { return; }
    if (url.origin === location.origin && posts.has(url.pathname)) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); event.stopPropagation(); openArticle(url, posts.get(url.pathname).dataset.title);
    } else {
      link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  });
  new MutationObserver(() => {
    if (win.hidden || win.dataset.state === 'closed') tabs.forEach(suspend); else if (active) resume(active);
  }).observe(win, {attributes:true, attributeFilter:['hidden']});
  win.addEventListener('blanktime:window-hidden', event => {
    tabs.forEach(tab => tab.comments?.setActive(false));
    if (event.detail?.state === 'closed') tabs.forEach(suspend);
  });
  win.addEventListener('blanktime:window-opened', () => { if (active) resume(active); });
  document.addEventListener('blanktime:open-article', event => {
    const url = new URL(event.detail.href, location.href);
    const card = posts.get(url.pathname);
    if (card) openArticle(url, card.dataset.title);
  });
  addEventListener('popstate', () => {
    if (location.pathname === homePath) {
      activate(home, false, false); window.blanktimeDesktop.openWindow(win); document.title = siteTitle;
    } else {
      const card = posts.get(location.pathname);
      if (card) { openArticle(new URL(location.href), card.dataset.title, null, {navigate:false}); document.title = card.dataset.title + ' · ' + siteTitle; }
    }
  });
  const initial = document.getElementById('article-source')?.content.querySelector('[data-article]');
  // A page load restores content directly, without a launch scene or moving focus.
  if (initial) openArticle(new URL(location.href), initial.dataset.title, initial, {navigate:false, focus:false, animate:false});
})();
