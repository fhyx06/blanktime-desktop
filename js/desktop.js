(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const windows = [...document.querySelectorAll('.app-window')];
  const welcome = $('#welcome');
  const mobile = () => matchMedia('(max-width: 760px)').matches;
  let topZ = 10, activeWindow, desktopRestore = [];
  const loadArticle = href => document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href}}));
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
    win.hidden = false;
    win.dataset.state = 'open';
    focusWindow(win);
    if (focus) win.focus({preventScroll: true});
  }
  function hideWindow(win, state) {
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
  }
  windows.forEach(win => {
    win.dataset.state = win.hidden ? 'closed' : 'open';
    win.addEventListener('pointerdown', () => focusWindow(win));
    $('[data-action="minimize"]', win).addEventListener('click', () => hideWindow(win, 'minimized'));
    $('[data-action="close"]', win).addEventListener('click', () => {
      hideWindow(win, 'closed');
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
      const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('lostpointercapture', end); };
      target.addEventListener('pointermove', move);
      target.addEventListener('lostpointercapture', end);
    });
  });
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
    const win = document.getElementById(button.dataset.open);
    openWindow(win);
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
  window.blanktimeDesktop = {openWindow};
  const initialArticle = document.getElementById('article-source')?.content.querySelector('[data-article]');
  if (initialArticle || welcomeDismissed) { welcome.hidden = true; welcome.dataset.state = 'closed'; syncDock(); }
  else openWindow(welcome, false);
})();
