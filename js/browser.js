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
  let theme = 'light';
  try { theme = localStorage.getItem('blanktime-reader-theme') || theme; } catch {}
  function applyTheme() {
    win.dataset.theme = theme;
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    themeButton.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    themeButton.title = themeButton.getAttribute('aria-label');
  }
  applyTheme();
  themeButton.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark'; applyTheme();
    try { localStorage.setItem('blanktime-reader-theme', theme); } catch {}
  });
  function suspend(tab) {
    tab.page.querySelectorAll('audio,video').forEach(media => media.pause());
    tab.page.querySelectorAll('iframe').forEach(frame => {
      const placeholder = document.createElement('template');
      tab.frames.push({placeholder, frame: frame.cloneNode(true)});
      frame.replaceWith(placeholder);
    });
  }
  function resume(tab) {
    tab.frames.forEach(({placeholder, frame}) => placeholder.replaceWith(frame));
    tab.frames = [];
  }
  function updateTools() {
    const article = active !== home;
    tocButton.disabled = !article || !active.toc;
    tocButton.setAttribute('aria-expanded', String(article && tocVisible));
    tocButton.setAttribute('aria-label', tocVisible ? '隐藏目录' : '显示目录');
    tocButton.title = tocButton.getAttribute('aria-label');
    if (active.toc) {
      active.toc.hidden = !tocVisible;
      active.toc.classList.toggle('is-open', tocVisible);
    }
    $('.browser-location').textContent = article ? '空白时间 / ' + active.title : '空白时间 / 所有文章';
    status.textContent = article ? (active.summary || '正在加载文章…') : `共 ${cards.filter(card => !card.hidden).length} 篇文章`;
  }
  function activate(tab, focus = true, navigate = true) {
    if (active && active !== tab) suspend(active);
    active = tab;
    if (navigate) route(tab, tab.url?.hash || "");
    tabs.forEach(item => {
      item.page.hidden = item !== tab;
      item.button.setAttribute('aria-selected', String(item === tab));
      item.button.tabIndex = item === tab ? 0 : -1;
    });
    if (!win.hidden) resume(tab);
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
    tab.wrap.remove(); tab.page.remove(); tab.frames = [];
    if (active === tab) activate(list[index - 1] || home);
  }
  const home = createTab('home', '文章首页', $('.browser-home'), false);
  activate(home, false, false);
  $('.browser-home-button').addEventListener('click', () => activate(home));
  tocButton.addEventListener('click', () => { setToc(!tocVisible); });
  screenMode.addEventListener('change', () => { tocVisible = readToc(); updateTools(); });
  $('.browser-search').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    cards.forEach(card => { card.hidden = !card.textContent.toLocaleLowerCase().includes(query); });
    $('.browser-empty').hidden = cards.some(card => !card.hidden); updateTools();
  });
  win.querySelectorAll('.browser-cover img').forEach(img => {
    const fallback = () => { img.hidden = true; };
    img.addEventListener('error', fallback);
    if (img.complete && !img.naturalWidth) fallback();
  });
  function openArticle(url, title, source = null, navigate = true) {
    let tab = tabs.get(url.pathname);
    if (!tab) {
      const page = document.createElement('div'); page.className = 'browser-page browser-article-page reading-layout'; pages.append(page);
      tab = createTab(url.pathname, title, page);
      tab.url = url; load(tab, source);
    }
    tab.url = url;
    window.blanktimeDesktop.openWindow(win);
    activate(tab, true, navigate);
    if (url.hash && tab.article) jump(tab, url.hash);
  }
  function jump(tab, hash) {
    try {
      const id = decodeURIComponent(hash.slice(1));
      [...tab.article.querySelectorAll('[id]')].find(el => el.id === tab.prefix + id || el.id === id)?.scrollIntoView({block:'start'});
    } catch {}
  }
  async function load(tab, initialSource = null) {
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
      // Prefix IDs to avoid collisions between article tabs.
      article.querySelectorAll('[id]').forEach(node => { node.id = tab.prefix + node.id; });
      for (const attribute of ['aria-controls','aria-labelledby','for']) {
        article.querySelectorAll(`[${attribute}]`).forEach(node => node.setAttribute(attribute, node.getAttribute(attribute).split(/\s+/).map(id => tab.prefix + id).join(' ')));
      }
      article.querySelectorAll('[src],a[href]').forEach(node => {
        const attr = node.hasAttribute('src') ? 'src' : 'href', value = node.getAttribute(attr);
        if (value && !value.startsWith('#')) {
          try { node.setAttribute(attr, new URL(value, tab.url).href); } catch {}
        }
      });
      article.querySelectorAll('a[href]').forEach(link => {
        try {
          const url = new URL(link.href);
          if (!link.getAttribute('href').startsWith('#') && (url.origin !== location.origin || !posts.has(url.pathname))) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        } catch {}
      });
      const scroll = document.createElement('div'); scroll.className = 'article-scroll'; scroll.tabIndex = 0; scroll.setAttribute('aria-label','文章正文'); scroll.append(article);
      const toc = document.createElement('aside'); toc.className = 'toc-panel'; toc.setAttribute('aria-label','文章目录');
      const label = document.createElement('div'); label.className = 'toc-heading'; label.textContent = '本文目录';
      const nav = document.createElement('nav'); nav.className = 'browser-toc'; toc.append(label, nav); tab.toc = toc;
      const plain = article.querySelector('.post-content').cloneNode(true); plain.querySelectorAll('.katex-mathml').forEach(node => node.remove());
      const count = (plain.textContent.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+/g) || []).length;
      tab.summary = `${count.toLocaleString()} 字 · 约 ${Math.max(1, Math.ceil(count / 400))} 分钟`;
      tab.page.replaceChildren(scroll, toc);
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
      scroll.addEventListener('scroll', progress, {passive:true});
      tab.observer = new ResizeObserver(progress); tab.observer.observe(scroll);
      if (active !== tab || win.hidden) suspend(tab);
      if (active === tab) { updateTools(); progress(); if (tab.url.hash) jump(tab, tab.url.hash); }
    } catch (error) {
      if (error.name === 'AbortError') return;
      message.textContent = '文章加载失败，请检查连接后重试。';
      const retry = document.createElement('button'); retry.textContent = '重试'; retry.addEventListener('click', () => load(tab)); message.append(document.createElement('br'), retry);
      tab.summary = '文章加载失败'; if (active === tab) updateTools();
    } finally { tab.page.removeAttribute('aria-busy'); }
  }
  // Article links share the same tabbed reading surface.
  win.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.closest('.browser-toc') || event.defaultPrevented) return;
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
    if (win.hidden) tabs.forEach(suspend); else if (active) resume(active);
  }).observe(win, {attributes:true, attributeFilter:['hidden']});
  document.addEventListener('blanktime:open-article', event => {
    const url = new URL(event.detail.href, location.href);
    const card = posts.get(url.pathname);
    if (card) openArticle(url, card.dataset.title);
  });
  addEventListener('popstate', () => {
    if (location.pathname === homePath) {
      window.blanktimeDesktop.openWindow(win); activate(home, false, false); document.title = siteTitle;
    } else {
      const card = posts.get(location.pathname);
      if (card) { openArticle(new URL(location.href), card.dataset.title, null, false); document.title = card.dataset.title + ' · ' + siteTitle; }
    }
  });
  const initial = document.getElementById('article-source')?.content.querySelector('[data-article]');
  if (initial) openArticle(new URL(location.href), initial.dataset.title, initial, false);
})();
