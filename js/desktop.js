(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const windows = [...document.querySelectorAll('.app-window')];
  const welcome = $('#welcome'), reader = $('#reader');
  const home = document.body.dataset.home;
  const mobile = () => matchMedia('(max-width: 760px)').matches;
  const themeButton = $('#reader-theme-toggle'), tocButton = $('#reader-toc-toggle');
  const tocPanel = $('#article-toc');
  function readPreference(key, fallback) {
    try { return localStorage.getItem(`blanktime-reader-${key}`) ?? fallback; } catch { return fallback; }
  }
  function savePreference(key, value) {
    try { localStorage.setItem(`blanktime-reader-${key}`, value); } catch {}
  }
  const tocVisibility = {
    desktop: readPreference('toc-desktop', 'true') === 'true',
    mobile: readPreference('toc-mobile', 'false') === 'true'
  };
  function applyReaderTheme(theme) {
    reader.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    const dark = reader.dataset.theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    themeButton.title = themeButton.getAttribute('aria-label');
  }
  function applyTocVisibility() {
    const visible = tocVisibility[mobile() ? 'mobile' : 'desktop'];
    tocPanel.hidden = !visible;
    tocPanel.classList.toggle('is-open', mobile() && visible);
    tocButton.setAttribute('aria-expanded', String(visible));
    tocButton.setAttribute('aria-label', visible ? '隐藏目录' : '显示目录');
    tocButton.title = tocButton.getAttribute('aria-label');
  }
  function setTocVisibility(visible) {
    const mode = mobile() ? 'mobile' : 'desktop';
    tocVisibility[mode] = visible;
    savePreference(`toc-${mode}`, String(visible));
    applyTocVisibility();
  }
  applyReaderTheme(readPreference('theme', 'light'));
  applyTocVisibility();
  themeButton.addEventListener('click', () => {
    applyReaderTheme(reader.dataset.theme === 'dark' ? 'light' : 'dark');
    savePreference('theme', reader.dataset.theme);
  });
  tocButton.addEventListener('click', () => setTocVisibility(tocPanel.hidden));
  matchMedia('(max-width: 760px)').addEventListener('change', applyTocVisibility);
  let topZ = 10, activeWindow, request = 0, currentPath = location.pathname, currentTitle = document.title;
  let headings = [], tocLinks = [], desktopRestore = [];
  let suspendedArticleFrames = [];
  function stopArticleMedia() {
    reader.querySelectorAll('audio, video').forEach(media => media.pause());
    // Hiding a cross-origin iframe does not stop its player. Detach its browsing
    // context on close, keeping only an inert copy for the next explicit reopen.
    reader.querySelectorAll('.post-content iframe').forEach(frame => {
      const placeholder = document.createElement('template');
      suspendedArticleFrames.push({placeholder, frame: frame.cloneNode(true)});
      frame.replaceWith(placeholder);
    });
  }
  function restoreArticleMedia() {
    suspendedArticleFrames.forEach(({placeholder, frame}) => {
      if (reader.contains(placeholder)) placeholder.replaceWith(frame);
    });
    suspendedArticleFrames = [];
  }
  let welcomeDismissed = false;
  try { welcomeDismissed = sessionStorage.getItem('welcome-dismissed') === 'yes'; } catch {}
  function dismissWelcome() {
    welcomeDismissed = true;
    try { sessionStorage.setItem('welcome-dismissed', 'yes'); } catch {}
  }
  function syncDock() {
    document.querySelectorAll('[data-open]').forEach(button => {
      const win = document.getElementById(button.dataset.open);
      button.classList.toggle('is-running', win.dataset.state !== 'closed');
      button.classList.toggle('is-focused', activeWindow === win && !win.hidden);
    });
  }
  function focusWindow(win) {
    activeWindow = win;
    windows.forEach(other => other.classList.toggle('is-focused', other === win));
    win.style.zIndex = ++topZ;
    syncDock();
  }
  function openWindow(win, focus = true) {
    if (win === reader) restoreArticleMedia();
    win.hidden = false;
    win.dataset.state = 'open';
    focusWindow(win);
    if (focus) win.focus({preventScroll: true});
  }
  function hideWindow(win, state) {
    if (win === reader) { ++request; reader.removeAttribute('aria-busy'); }
    if (win === reader && state === 'closed') stopArticleMedia();
    win.hidden = true;
    win.dataset.state = state;
    if (win === welcome) dismissWelcome();
    const visible = windows.filter(other => !other.hidden).sort((a,b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    if (visible.length) { focusWindow(visible[0]); visible[0].focus({preventScroll: true}); }
    else { activeWindow = null; $(`[data-open="${win.id}"]`).focus(); }
    syncDock();
  }
  function maximize(win) {
    if (mobile()) return;
    win.classList.toggle('is-maximized');
    const button = $('[data-action="maximize"]', win);
    button.setAttribute('aria-label', win.classList.contains('is-maximized') ? '还原窗口' : '最大化');
    button.title = button.getAttribute('aria-label');
    updateProgress();
  }
  windows.forEach(win => {
    win.dataset.state = win.hidden ? 'closed' : 'open';
    win.addEventListener('pointerdown', () => focusWindow(win));
    $('[data-action="minimize"]', win).addEventListener('click', () => hideWindow(win, 'minimized'));
    $('[data-action="close"]', win).addEventListener('click', () => {
      hideWindow(win, 'closed');
      if (win === reader && location.pathname !== home) {
        history.pushState({}, '', home);
        document.title = '空白时间';
      }
    });
    $('[data-action="maximize"]', win).addEventListener('click', () => maximize(win));
    $('.titlebar', win).addEventListener('dblclick', event => {
      if (!event.target.closest('button')) maximize(win);
    });
    for (const direction of ['n','s','e','w','ne','nw','se','sw']) {
      const handle = document.createElement('div');
      handle.className = `resize-handle resize-${direction}`;
      handle.dataset.resize = direction;
      handle.setAttribute('aria-hidden', 'true');
      win.append(handle);
    }
    win.addEventListener('pointerdown', event => {
      const resize = event.target.closest('[data-resize]');
      const title = event.target.closest('.titlebar');
      if (mobile() || win.classList.contains('is-maximized') || event.button !== 0 || (!resize && !title) || event.target.closest('button')) return;
      event.preventDefault();
      const start = win.getBoundingClientRect();
      const windowStyle = getComputedStyle(win);
      const minWidth = parseFloat(windowStyle.minWidth) || 380;
      const minHeight = parseFloat(windowStyle.minHeight) || 320;
      const x = event.clientX, y = event.clientY, dir = resize?.dataset.resize;
      const target = resize || title;
      target.setPointerCapture(event.pointerId);
      const move = e => {
        const dx = e.clientX - x, dy = e.clientY - y;
        const maxRight = innerWidth - 8, maxBottom = innerHeight - 8;
        let left = start.left, top = start.top, width = start.width, height = start.height;
        if (!dir) {
          left = Math.max(70, Math.min(maxRight - width, start.left + dx));
          top = Math.max(8, Math.min(maxBottom - 45, start.top + dy));
        } else {
          if (dir.includes('e')) width = Math.max(minWidth, Math.min(maxRight - left, start.width + dx));
          if (dir.includes('s')) height = Math.max(minHeight, Math.min(maxBottom - top, start.height + dy));
          if (dir.includes('w')) { left = Math.max(70, Math.min(start.right - minWidth, start.left + dx)); width = start.right - left; }
          if (dir.includes('n')) { top = Math.max(8, Math.min(start.bottom - minHeight, start.top + dy)); height = start.bottom - top; }
        }
        Object.assign(win.style, {left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`});
      };
      const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('lostpointercapture', end); updateProgress(); };
      target.addEventListener('pointermove', move);
      target.addEventListener('lostpointercapture', end);
    });
  });
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const win = document.getElementById(button.dataset.open);
    if (win === reader && !$('[data-article]', reader)) {
      const first = $('.file-link');
      if (first) loadArticle(first.href);
    } else {
      openWindow(win);
      if (win === reader) {
        if (location.pathname !== currentPath) history.pushState({}, '', currentPath);
        document.title = currentTitle;
      }
    }
  }));
  const filesWindow = $('#files'), desktopFiles = $('#desktop-files');
  desktopFiles.addEventListener('click', () => openWindow(filesWindow));
  const fileRows = [...document.querySelectorAll('.post-file')];
  const fileSearch = $('#files-search'), fileSort = $('#files-sort'), openFileButton = $('#files-open');
  let fileCategory = 'all', selectedFile = null;
  function selectFile(row) {
    selectedFile = row;
    fileRows.forEach(item => item.classList.toggle('is-selected', item === row));
    openFileButton.disabled = !row;
    updateFileCount();
  }
  function updateFileCount() {
    const count = fileRows.filter(row => !row.hidden).length;
    $('#files-count').textContent = `共 ${count} 项${count !== fileRows.length ? ` / 全部 ${fileRows.length} 项` : ''}${selectedFile ? ' · 已选中 1 项' : ''}`;
  }
  function filterFiles() {
    const query = fileSearch.value.trim().toLocaleLowerCase();
    for (const row of fileRows) {
      const categories = JSON.parse(row.dataset.categories);
      const matchesCategory = fileCategory === 'all' || (fileCategory === 'uncategorized' ? categories.length === 0 : categories.includes(fileCategory));
      row.hidden = !matchesCategory || !row.dataset.search.toLocaleLowerCase().includes(query);
    }
    if (selectedFile?.hidden) selectFile(null);
    const sorted = [...fileRows].sort((a,b) => fileSort.value === 'title'
      ? a.dataset.title.localeCompare(b.dataset.title, 'zh-CN')
      : (Number(a.dataset.date) - Number(b.dataset.date)) * (fileSort.value === 'oldest' ? 1 : -1));
    $('#files-list').append(...sorted);
    $('.files-empty').hidden = fileRows.some(row => !row.hidden);
    updateFileCount();
  }
  function changeCategory(button) {
    fileCategory = button.dataset.category;
    document.querySelectorAll('.files-category').forEach(item => {
      item.classList.toggle('is-selected', item === button);
      if (item === button) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
    $('#files-location').textContent = $('span', button).textContent;
    selectFile(null); filterFiles();
  }
  document.querySelectorAll('.files-category').forEach(button => button.addEventListener('click', () => changeCategory(button)));
  fileSearch.addEventListener('input', filterFiles);
  fileSort.addEventListener('change', filterFiles);
  $('#files-reset').addEventListener('click', () => { fileSearch.value = ''; changeCategory($('.files-category[data-category="all"]')); });
  $('#welcome-start-reading').addEventListener('click', () => {
    fileSearch.value = '';
    fileSort.value = 'newest';
    changeCategory($('.files-category[data-category="all"]'));
    $('.files-list-scroll').scrollTop = 0;
    openWindow(filesWindow);
  });
  openFileButton.addEventListener('click', () => { if (selectedFile) loadArticle($('.file-link', selectedFile).href); });
  fileRows.forEach(row => {
    const link = $('.file-link', row);
    row.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); selectFile(row);
      if (mobile() || (event.target.closest('a') && event.detail === 0)) loadArticle(link.href);
    });
    row.addEventListener('dblclick', event => {
      if (mobile() || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); loadArticle(link.href);
    });
  });
  filterFiles();
  $('.desktop-toggle').addEventListener('click', () => {
    const visible = windows.filter(win => !win.hidden);
    if (visible.length) {
      desktopRestore = visible.sort((a,b) => Number(a.style.zIndex)-Number(b.style.zIndex));
      visible.forEach(win => hideWindow(win, 'minimized'));
    } else desktopRestore.forEach(win => openWindow(win, false));
  });
  function toast(message) {
    const el = $('#announcement'); el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 5000);
  }
  async function loadArticle(href, push = true) {
    const url = new URL(href, location.href), id = ++request;
    reader.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(url.href);
      if (!response.ok) throw new Error('Article not found');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const article = $('[data-article]', doc);
      if (!article) throw new Error('Missing article');
      if (id !== request) return;
      stopArticleMedia();
      suspendedArticleFrames = [];
      $('.article-scroll').replaceChildren(document.importNode(article, true));
      currentPath = url.pathname;
      if (push && location.pathname !== url.pathname) history.pushState({}, '', url.pathname + url.hash);
      currentTitle = doc.title;
      document.title = currentTitle;
      openWindow(reader);
      $('.article-scroll').scrollTop = 0;
      setupArticle();
      if (url.hash) { try { document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView(); } catch {} }
    } catch {
      if (id === request) toast('文章暂时未能打开，请检查连接后重试。');
    } finally { if (id === request) reader.removeAttribute('aria-busy'); }
  }
  // 280-284 疑似死代码
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-article-link]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); loadArticle(link.href);
  });
  async function copyCode(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    // HTTP LAN previews have no Clipboard API; retain a user-gesture fallback.
    const previous = document.activeElement;
    const selection = document.getSelection();
    const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(field);
    try {
      field.focus({preventScroll: true}); field.select();
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      field.remove(); previous?.focus({preventScroll: true});
      if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
    }
  }
  function setupCodeBlocks(article) {
    article.querySelectorAll('.post-content pre').forEach((original, index) => {
      if (original.closest('.code-block')) return;
      const source = original.querySelector('code') || original;
      const code = document.createElement('code');
      code.className = source.className;
      code.innerHTML = source.innerHTML;
      code.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
      const text = code.textContent;
      const lines = text.replace(/\n$/, '').split('\n').length;
      const language = [...source.classList].find(name => name !== 'hljs')?.replace(/^language-/, '') || 'text';
      const block = document.createElement('div'); block.className = 'code-block';
      const header = document.createElement('div'); header.className = 'code-block-header';
      const dots = document.createElement('span'); dots.className = 'code-traffic-lights'; dots.setAttribute('aria-hidden','true'); dots.innerHTML = '<i></i><i></i><i></i>';
      const label = document.createElement('span'); label.className = 'code-language'; label.textContent = language;
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'code-copy'; copy.textContent = '复制代码'; copy.setAttribute('aria-label', `复制第 ${index + 1} 个代码块`);
      copy.addEventListener('click', async () => {
        try { await copyCode(text); copy.textContent = '已复制'; toast('复制好了 :)'); }
        catch { copy.textContent = '复制失败'; toast('浏览器未允许复制，请选中代码手动复制 :('); }
        clearTimeout(copy.resetTimer); copy.resetTimer = setTimeout(() => copy.textContent = '复制代码', 2000);
      });
      const body = document.createElement('div'); body.className = 'code-block-body'; body.id = `code-body-${index}`;
      const numbers = document.createElement('div'); numbers.className = 'code-line-numbers'; numbers.setAttribute('aria-hidden', 'true'); numbers.textContent = Array.from({length:lines}, (_, i) => i+1).join('\n');
      const pre = document.createElement('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', `${language} 代码，可横向滚动`); pre.append(code); body.append(numbers, pre);
      const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'code-collapse'; collapse.setAttribute('aria-expanded','true'); collapse.setAttribute('aria-controls', body.id); collapse.setAttribute('aria-label','折叠代码');
      collapse.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m7 9 3 3 3-3"/></svg>';
      collapse.addEventListener('click', () => {
        body.hidden = !body.hidden;
        collapse.setAttribute('aria-expanded', String(!body.hidden)); collapse.setAttribute('aria-label', body.hidden ? '展开代码' : '折叠代码');
        updateProgress();
      });
      header.append(dots, label, copy, collapse); block.append(header, body);
      (original.closest('figure.highlight') || original).replaceWith(block);
    });
  }
  function articleText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.katex-mathml').forEach(node => node.remove());
    return clone.textContent;
  }
  function setupArticle() {
    const article = $('[data-article]', reader);
    if (!article) return;
    $('#filename').textContent = article.dataset.file;
    const text = articleText($('.post-content', article));
    const count = (text.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+/g) || []).length;
    $('#word-count').textContent = `${count.toLocaleString()} 字 · 约 ${Math.max(1, Math.ceil(count/400))} 分钟`;
    setupCodeBlocks(article);
    article.querySelectorAll('.legacy-tabs').forEach(group => {
      const tabs = [...group.querySelectorAll('[role="tab"]')];
      const panels = [...group.querySelectorAll('[role="tabpanel"]')];
      function activate(index) {
        tabs.forEach((tab, i) => {
          tab.setAttribute('aria-selected', String(i === index));
          tab.tabIndex = i === index ? 0 : -1;
          panels[i].hidden = i !== index;
        });
        updateProgress();
      }
      group.classList.add('is-enhanced');
      tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => activate(i));
        tab.addEventListener('keydown', event => {
          const next = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); activate(next); tabs[next].focus();
        });
      });
      activate(0);
    });
    headings = [...article.querySelectorAll('.post-content h1,.post-content h2,.post-content h3,.post-content h4,.post-content h5,.post-content h6')];
    const toc = $('#toc'); toc.replaceChildren();
    const minLevel = Math.min(...headings.map(h => Number(h.tagName.slice(1))));
    const ids = new Set();
    headings.forEach((heading, index) => {
      if (!heading.id || ids.has(heading.id)) heading.id = `section-${index + 1}`;
      ids.add(heading.id);
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = articleText(heading);
      link.style.setProperty('--level', Math.min(4, Number(heading.tagName.slice(1)) - minLevel));
      link.addEventListener('click', event => {
        event.preventDefault(); heading.scrollIntoView({block:'start',behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        history.replaceState({}, '', `${currentPath}#${encodeURIComponent(heading.id)}`);
        if (mobile()) setTocVisibility(false);
      });
      toc.append(link);
    });
    if (!headings.length) { const empty = document.createElement('p'); empty.className = 'empty-toc'; empty.textContent = '这篇文章没有章节标题'; toc.append(empty); }
    tocLinks = [...toc.querySelectorAll('a')];
    article.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.addEventListener('load', updateProgress); });
    article.querySelectorAll('iframe').forEach(frame => { frame.loading = 'lazy'; });
    updateProgress();
  }
  function updateProgress() {
    const scroll = $('.article-scroll');
    const max = scroll.scrollHeight - scroll.clientHeight;
    const progress = max <= 1 ? 100 : Math.min(100, Math.round(scroll.scrollTop/max*100));
    $('#reading-progress').textContent = `已读 ${progress}%`;
    let active = 0;
    const boundary = scroll.getBoundingClientRect().top + 90;
    headings.forEach((heading,index) => { if (heading.getBoundingClientRect().top <= boundary) active = index; });
    if (max > 1 && progress === 100) active = headings.length - 1;
    tocLinks.forEach((link,index) => {
      link.classList.toggle('active', index === active);
      if (index === active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
    });
  }
  $('.article-scroll').addEventListener('scroll', updateProgress, {passive:true});
  new ResizeObserver(updateProgress).observe($('.article-scroll'));
  addEventListener('popstate', () => {
    if (location.pathname === home) { hideWindow(reader, 'closed'); if (!welcomeDismissed) openWindow(welcome); document.title = '空白时间'; }
    else loadArticle(location.href, false);
  });
  addEventListener('resize', () => {
    if (mobile()) return;
    windows.forEach(win => {
      if (!win.style.width || win.classList.contains('is-maximized')) return;
      const rect = win.getBoundingClientRect();
      const width = Math.min(rect.width, innerWidth - 88), height = Math.min(rect.height, innerHeight - 20);
      Object.assign(win.style, {width: `${width}px`,height:`${height}px`,left:`${Math.max(76, Math.min(rect.left, innerWidth-width-8))}px`,top:`${Math.max(8, Math.min(rect.top,innerHeight-height-8))}px`});
    });
  });
  function clock() { $('#clock').textContent = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()); }
  clock(); setInterval(clock, 30000);
  if ($('[data-article]', reader)) {
    welcome.hidden = true; welcome.dataset.state = 'closed'; setupArticle(); openWindow(reader, false);
    if (location.hash) { try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch {} }
  } else if (welcomeDismissed) { welcome.hidden = true; welcome.dataset.state = 'closed'; syncDock(); }
  else openWindow(welcome, false);
})();
