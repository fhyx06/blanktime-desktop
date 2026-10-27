(() => {
  'use strict';
  const win = document.getElementById('files'), fs = window.blanktimeFS;
  if (!win || !fs) return;
  const $ = selector => win.querySelector(selector);
  const list = $('#files-list'), locationInput = $('#files-location'), search = $('#files-search');
  const sort = $('#files-sort'), category = $('#files-category'), categoryLabel = $('#files-category-label');
  const openButton = $('#files-open'), back = $('#files-back'), forward = $('#files-forward'), up = $('#files-up');
  const error = $('#files-error'), empty = $('.files-empty'), reset = $('#files-reset');
  const musicState = $('#files-music-state'), musicRetry = $('#files-music-retry'), musicPath = fs.home + '/Music';
  const locationForm = $('#files-location-form'), crumbs = $('#files-crumbs'), editPath = $('#files-edit-path');
  const places = $('#files-places'), listExpanded = new Set(), sidebarExpanded = new Set();
  const settings = window.blanktimeFileConfig || {};
  const mobile = matchMedia('(max-width:760px)');
  const appIds = new Set(['files', 'browser', 'album', 'music', 'system-info', 'terminal', 'thoughts']);
  const types = {directory:'文件夹', article:'Markdown', image:'图片', music:'在线音频', app:'应用快捷方式', text:'文本文件'};
  let boundary, cwd = '', entries = [], rows = [], selected = null, history = [], historyIndex = -1, matchedCount = 0;
  let musicVersion = '', retryingMusic = false;
  function fail(message) { error.textContent = message; error.hidden = false; return false; }
  function clearError() { error.hidden = true; error.textContent = ''; }
  function resolve(path, current = cwd || fs.home) {
    if (typeof path !== 'string' || !path || path.length > 4096) throw Error('invalid_path');
    return fs.resolve(path, {cwd:current, home:fs.home, isRoot:false});
  }
  function managed(path) { return fs.contains(path, boundary); }
  function directory(path) {
    const node = resolve(path);
    if (node.type !== 'directory') throw Error('not_directory');
    if (!managed(fs.pathOf(node))) throw Error('outside_scope');
    return node;
  }
  function showFailure(cause) {
    const key = cause.terminalKey || cause.message;
    return fail(key === 'outside_scope' ? '该位置不在文件管理范围内。' : key === 'permission_denied'
      ? '无法访问该位置。' : key === 'not_directory' ? '该路径不是文件夹。' : '找不到该文件夹，请检查路径。');
  }
  function setSelected(row) {
    selected = rows.includes(row) ? row : null;
    rows.forEach(item => item.classList.toggle('is-selected', item === selected));
    openButton.disabled = !selected;
    updateCount();
  }
  function updateCount() {
    const filtered = search.value.trim() || (!categoryLabel.hidden && category.value !== 'all');
    $('#files-count').textContent = (filtered ? `共 ${matchedCount} / 全部 ${entries.length} 项` : `共 ${entries.length} 项`)
      + (!filtered && rows.length > entries.length ? ` · 展开显示 ${rows.length} 项` : '')
      + (selected ? ' · 已选中 1 项' : '');
  }
  function fileSize(node) {
    if (node.type === 'directory' || node.size === null || node.size === undefined) return '—';
    const size = Number(node.size);
    if (!Number.isFinite(size) || size < 0) return '—';
    if (size < 1024) return size + ' B';
    const units = ['KB','MB','GB'];
    let value = size / 1024, index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return Number(value.toFixed(1)) + ' ' + units[index];
  }
  function fileDate(node) {
    if (!node.date) return '—';
    const date = new Date(node.date);
    if (!Number.isFinite(date.valueOf())) return '—';
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function categories(node) { return Array.isArray(node.categories) ? node.categories : []; }
  function makeIcon(node) {
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
    if (node.type === 'directory' || (node.type === 'app' && node.icon === 'folder')) {
      icon.className = 'folder-art folder-art-small'; icon.append(document.createElement('span'));
    } else if (node.type === 'article') {
      icon.className = 'file-icon'; icon.textContent = 'M';
      const arrow = document.createElement('span'); arrow.textContent = '↓'; icon.append(arrow);
    } else if (node.type === 'music') {
      icon.className = 'file-node-icon file-music-cover'; icon.textContent = '♪';
      try {
        const url = node.cover && new URL(node.cover, location.href);
        if (url && ['http:', 'https:'].includes(url.protocol)) {
          const image = document.createElement('img'); image.alt = ''; image.draggable = false;
          image.loading = 'lazy'; image.decoding = 'async';
          image.addEventListener('error', () => image.remove(), {once:true});
          image.src = url.href; icon.append(image);
        }
      } catch {}
    } else {
      icon.className = 'file-node-icon';
      if (node.type === 'app' && node.icon && !node.icon.startsWith('#')) {
        try {
          const url = new URL(node.icon, location.href);
          if (['http:', 'https:'].includes(url.protocol)) {
            const image = document.createElement('img'); image.src = url.href; image.alt = ''; image.draggable = false;
            icon.classList.add('file-app-icon'); icon.append(image); return icon;
          }
        } catch {}
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      const symbol = node.type === 'app' && /^#i-[a-z-]+$/.test(node.icon || '') ? node.icon : null;
      use.setAttribute('href', symbol || (node.type === 'image' ? '#i-album' : node.type === 'app' ? '#i-grid' : '#i-book'));
      svg.append(use); icon.append(svg);
    }
    return icon;
  }
  function openNode(node) {
    clearError();
    try {
      if (node.type === 'directory') return navigate(fs.pathOf(node));
      if (node.type === 'article') {
        document.dispatchEvent(new CustomEvent('blanktime:open-article', {detail:{href:new URL(node.url, location.href).href}}));
      } else if (node.type === 'image') {
        if (!window.blanktimeImages) return fail('图片查看器暂不可用。');
        window.blanktimeImages.open(node.parent.images.map(item => ({...item})), node.imageIndex,
          {kind:'album', source:node.parent.name, trigger:selected?.querySelector('.file-link') || openButton});
      } else if (node.type === 'music') {
        if (window.blanktimeMusic?.playTrack?.(node.trackKey) !== true) return fail('歌曲暂不可用，请稍后重试。');
      } else if (node.type === 'app') {
        const app = appIds.has(node.appId) && document.getElementById(node.appId);
        if (!app) return fail('该应用暂不可用。');
        window.blanktimeDesktop.openWindow(app);
      } else return fail('暂不支持打开此类型的文件。');
      return true;
    } catch { return fail('文件暂时无法打开，请重试。'); }
  }
  function toggleButton(node, expanded, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'files-tree-toggle';
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${expanded ? '收起' : '展开'} ${node.name || '我的文件'}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox','0 0 16 16'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d','m6 3 5 5-5 5'); svg.append(path); button.append(svg);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); handler(); });
    button.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); });
    return button;
  }
  function toggleList(node) {
    const path = fs.pathOf(node), closing = listExpanded.has(path);
    try { directory(path); } catch (cause) { return showFailure(cause); }
    let selectedPath = selected?.dataset.path;
    if (closing) {
      listExpanded.delete(path);
      if (selectedPath?.startsWith(path + '/')) selectedPath = path;
    } else listExpanded.add(path);
    render(selectedPath);
    rows.find(row => row.dataset.path === path)?.querySelector('.files-tree-toggle')?.focus({preventScroll:true});
  }
  function makeRow(node, depth = 0, expandable = true) {
    const row = document.createElement('tr');
    row.className = 'file-row' + (node.type === 'article' ? ' post-file' : '');
    row.dataset.path = fs.pathOf(node); row.dataset.type = node.type;
    row.dataset.title = node.title || node.name.replace(/\.md$/i, '');
    row.style.setProperty('--file-depth', depth);
    const nameCell = document.createElement('td'), nameWrap = document.createElement('div'); nameWrap.className = 'file-name-cell';
    const link = document.createElement(node.type === 'article' ? 'a' : 'button');
    link.className = 'file-link'; link.title = node.name;
    if (node.type === 'article') link.href = node.url; else link.type = 'button';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = node.name;
    if (node.type === 'directory' && node.children.size && expandable && managed(fs.pathOf(node))) nameWrap.append(toggleButton(node, listExpanded.has(fs.pathOf(node)), () => toggleList(node)));
    else { const spacer = document.createElement('span'); spacer.className = 'files-tree-spacer'; nameWrap.append(spacer); }
    link.append(makeIcon(node), name); nameWrap.append(link); nameCell.append(nameWrap); row.append(nameCell);
    for (const value of [fileSize(node), fileDate(node), types[node.type] || '文件']) {
      const cell = document.createElement('td'); cell.textContent = value; cell.title = value; row.append(cell);
    }
    const modified = event => event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    row.addEventListener('click', event => {
      if (modified(event)) return;
      event.preventDefault(); setSelected(row);
      if (mobile.matches || (event.target.closest('.file-link') && event.detail === 0)) openNode(node);
    });
    row.addEventListener('dblclick', event => {
      if (mobile.matches || modified(event)) return;
      event.preventDefault(); openNode(node);
    });
    row.fileNode = node;
    return row;
  }
  function compareNodes(a, b) {
    const folders = Number(b.type === 'directory') - Number(a.type === 'directory');
    if (folders) return folders;
    const nameOrder = a.name.localeCompare(b.name, 'zh-CN');
    if (sort.value === 'type') return (types[a.type] || a.type).localeCompare(types[b.type] || b.type, 'zh-CN') || nameOrder;
    if (sort.value === 'newest' || sort.value === 'oldest') {
      const aDate = a.date ? new Date(a.date).valueOf() : NaN, bDate = b.date ? new Date(b.date).valueOf() : NaN;
      if (!Number.isFinite(aDate) || !Number.isFinite(bDate)) return Number(!Number.isFinite(aDate)) - Number(!Number.isFinite(bDate)) || nameOrder;
      return (aDate - bDate) * (sort.value === 'newest' ? -1 : 1) || nameOrder;
    }
    return nameOrder;
  }
  function render(selectionPath = selected?.dataset.path) {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = entries.filter(node => {
      const text = [node.name, node.search || '', ...categories(node).map(item => item.name)].join(' ').toLocaleLowerCase();
      return (!query || text.includes(query)) && (categoryLabel.hidden || category.value === 'all'
        || (category.value === 'uncategorized' ? !categories(node).length : categories(node).some(item => item.id === category.value)));
    });
    const expandable = !query && (categoryLabel.hidden || category.value === 'all');
    rows = []; matchedCount = filtered.length;
    function appendNodes(nodes, depth) {
      nodes.sort(compareNodes).forEach(node => {
        rows.push(makeRow(node, depth, expandable));
        if (expandable && node.type === 'directory' && listExpanded.has(fs.pathOf(node))) {
          try { appendNodes(fs.list(directory(fs.pathOf(node))), depth + 1); } catch { listExpanded.delete(fs.pathOf(node)); }
        }
      });
    }
    appendNodes(filtered, 0); list.replaceChildren(...rows);
    setSelected(rows.find(row => row.dataset.path === selectionPath));
    empty.hidden = rows.length > 0;
    empty.querySelector('strong').textContent = entries.length ? '没有找到匹配的文件' : '此文件夹为空';
    reset.hidden = !search.value && category.value === 'all';
    renderMusicState();
  }
  function renderMusicState() {
    musicState.hidden = cwd !== musicPath;
    if (musicState.hidden) return;
    const node = resolve(cwd), state = node.loadState;
    const messages = {idle:'歌单尚未加载。', loading:'正在加载歌单…', error:'歌单加载失败，请重试。', disabled:'音乐功能未启用。'};
    musicState.hidden = !messages[state];
    musicState.dataset.state = state || '';
    musicState.querySelector('span').textContent = node.loadMessage || messages[state] || '';
    musicRetry.hidden = state !== 'idle' && state !== 'error';
    musicRetry.disabled = retryingMusic;
    musicRetry.textContent = state === 'idle' ? '加载歌单' : '重试';
    if (!entries.length) {
      if (!musicState.hidden) empty.hidden = true;
      else if (state === 'ready') empty.querySelector('strong').textContent = '歌单暂无歌曲';
    }
  }
  function refreshMusicDirectory(event) {
    if (event.detail?.path !== musicPath || !cwd || !managed(musicPath)) return;
    const node = resolve(musicPath);
    // Ignore repeated playlist notifications; playback progress must not rebuild the file table.
    const version = JSON.stringify([node.loadState, node.loadMessage, fs.list(node).map(item =>
      [item.name, item.trackKey, item.title, item.artist, item.cover, item.url, item.search])]);
    if (version === musicVersion) return;
    musicVersion = version;
    if (cwd !== musicPath && !rows.some(row => row.dataset.path === musicPath)) return;
    const scroll = $('.files-list-scroll'), scrollTop = scroll.scrollTop, key = selected?.fileNode.trackKey;
    entries = fs.list(directory(cwd)); render();
    if (key) setSelected(rows.find(row => row.fileNode.trackKey === key));
    scroll.scrollTop = scrollTop;
  }
  function updateCategories() {
    categoryLabel.hidden = cwd !== fs.home + '/Documents/Posts';
    category.replaceChildren(new Option('全部分类', 'all'));
    if (categoryLabel.hidden) return;
    const values = new Map();
    entries.forEach(node => categories(node).forEach(item => values.set(item.id, item.name)));
    [...values].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN')).forEach(([id, name]) => category.append(new Option(name, id)));
    if (entries.some(node => !categories(node).length)) category.append(new Option('未分类', 'uncategorized'));
  }
  function updateNavigation() {
    locationInput.value = cwd; locationInput.title = cwd;
    back.disabled = historyIndex <= 0; forward.disabled = historyIndex >= history.length - 1;
    up.disabled = cwd === boundary;
    renderBreadcrumbs(); renderSidebar();
  }
  function pathNodes() {
    const nodes = []; let node = resolve(cwd);
    while (node) { nodes.unshift(node); if (fs.pathOf(node) === boundary) break; node = node.parent; }
    return nodes;
  }
  function renderBreadcrumbs() {
    crumbs.replaceChildren();
    pathNodes().forEach((node, index) => {
      if (index) { const divider = document.createElement('span'); divider.className = 'files-crumb-divider'; divider.textContent = '›'; divider.setAttribute('aria-hidden','true'); crumbs.append(divider); }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = index ? node.name : '我的文件';
      button.dataset.path = fs.pathOf(node); button.title = button.dataset.path;
      if (button.dataset.path === cwd) button.setAttribute('aria-current', 'location');
      button.addEventListener('click', () => navigate(button.dataset.path)); crumbs.append(button);
    });
  }
  function revealCurrentLocation() {
    if (!cwd || win.hidden || ['closed', 'minimized'].includes(win.dataset.state)) return;
    if (!crumbs.hidden) crumbs.scrollLeft = Math.max(0, crumbs.scrollWidth - crumbs.clientWidth);
    const current = places.querySelector('.files-tree-link[aria-current="page"]')?.closest('.files-tree-row');
    if (!current) return;
    const bounds = places.getBoundingClientRect(), rowBounds = current.getBoundingClientRect();
    if (!bounds.height || !places.clientHeight) return;
    // A launch/restore transform may scale the window; scroll offsets use unscaled CSS pixels.
    const scale = places.offsetHeight ? bounds.height / places.offsetHeight : 1;
    const top = bounds.top + places.clientTop * scale, bottom = top + places.clientHeight * scale;
    if (rowBounds.top < top) places.scrollTop += (rowBounds.top - top) / scale;
    else if (rowBounds.bottom > bottom) places.scrollTop += (rowBounds.bottom - bottom) / scale;
  }
  function renderSidebar() {
    const container = document.createElement('ul'); container.className = 'files-tree';
    function appendDirectory(node, parent, depth) {
      const path = fs.pathOf(node), expanded = sidebarExpanded.has(path);
      const children = fs.list(node).filter(child => child.type === 'directory' && managed(fs.pathOf(child)));
      const item = document.createElement('li'), row = document.createElement('div'); row.className = 'files-tree-row'; row.style.setProperty('--file-depth',depth);
      row.classList.toggle('is-selected', path === cwd);
      if (children.length) {
        const toggle = toggleButton(node, expanded, () => {
          if (expanded) sidebarExpanded.delete(path); else sidebarExpanded.add(path);
          renderSidebar();
          [...places.querySelectorAll('.files-tree-row')].find(item => item.querySelector('.files-tree-link')?.dataset.path === path)?.querySelector('.files-tree-toggle')?.focus({preventScroll:true});
        });
        if (!depth) toggle.setAttribute('aria-label', `${expanded ? '收起' : '展开'} 我的文件`);
        row.append(toggle);
      } else { const spacer = document.createElement('span'); spacer.className = 'files-tree-spacer'; row.append(spacer); }
      const link = document.createElement('button'); link.type = 'button'; link.className = 'files-tree-link'; link.dataset.path = path; link.title = path;
      if (depth) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'), use = document.createElementNS('http://www.w3.org/2000/svg','use');
        icon.setAttribute('aria-hidden','true'); use.setAttribute('href','#i-folder'); icon.append(use); link.append(icon);
      }
      const label = document.createElement('span'); label.textContent = depth ? node.name : '我的文件'; link.append(label);
      if (path === cwd) link.setAttribute('aria-current','page');
      link.addEventListener('click', () => navigate(path)); row.append(link); item.append(row); parent.append(item);
      if (expanded && children.length) { const group = document.createElement('ul'); group.className = 'files-tree'; item.append(group); children.forEach(child => appendDirectory(child, group, depth + 1)); }
    }
    appendDirectory(resolve(boundary), container, 0); places.replaceChildren(container);
  }
  function setAddressEditing(editing, focus = false) {
    locationForm.classList.toggle('is-editing',editing); locationInput.hidden = !editing;
    crumbs.hidden = editing; editPath.hidden = editing;
    locationInput.value = cwd;
    if (editing && focus) { locationInput.focus(); locationInput.select(); }
    if (!editing) revealCurrentLocation();
  }
  function navigate(path, historyTarget = null) {
    let node;
    try { node = directory(path); } catch (cause) { locationInput.value = cwd; return showFailure(cause); }
    const next = fs.pathOf(node);
    if (historyTarget === null && next !== cwd) { history.splice(historyIndex + 1); history.push(next); historyIndex = history.length - 1; }
    else if (historyTarget !== null) historyIndex = historyTarget;
    cwd = next; entries = fs.list(node); selected = null; search.value = ''; clearError();
    pathNodes().slice(0,-1).forEach(node => sidebarExpanded.add(fs.pathOf(node)));
    updateCategories(); render(); updateNavigation(); $('.files-list-scroll').scrollTop = 0;
    revealCurrentLocation();
    return true;
  }
  locationForm.addEventListener('submit', event => { event.preventDefault(); if (navigate(locationInput.value)) setAddressEditing(false); });
  editPath.addEventListener('click', () => setAddressEditing(true, true));
  locationForm.addEventListener('click', event => { if (event.target === locationForm || event.target === crumbs) setAddressEditing(true, true); });
  locationInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); clearError(); setAddressEditing(false); editPath.focus(); }
  });
  locationInput.addEventListener('focus', () => locationInput.select());
  locationInput.addEventListener('blur', () => setAddressEditing(false));
  back.addEventListener('click', () => { if (historyIndex > 0) navigate(history[historyIndex - 1], historyIndex - 1); });
  forward.addEventListener('click', () => { if (historyIndex + 1 < history.length) navigate(history[historyIndex + 1], historyIndex + 1); });
  up.addEventListener('click', () => { if (cwd !== boundary) navigate('..'); });
  openButton.addEventListener('click', () => { if (selected) openNode(selected.fileNode); });
  search.addEventListener('input', () => render()); sort.addEventListener('change', () => render()); category.addEventListener('change', () => render());
  reset.addEventListener('click', () => { search.value = ''; category.value = 'all'; render(); });
  musicRetry.addEventListener('click', () => {
    if (retryingMusic || cwd !== musicPath) return;
    if (!['idle', 'error'].includes(resolve(cwd).loadState)) return;
    if (typeof window.blanktimeMusic?.retryPlaylist !== 'function') return fail('音乐播放器暂不可用。');
    clearError(); retryingMusic = true; renderMusicState();
    try {
      Promise.resolve(window.blanktimeMusic.retryPlaylist()).catch(() => { if (cwd === musicPath) fail('歌单暂时无法加载，请重试。'); })
        .finally(() => { retryingMusic = false; renderMusicState(); });
    } catch { retryingMusic = false; renderMusicState(); fail('歌单暂时无法加载，请重试。'); }
  });
  win.addEventListener('blanktime:window-opened', revealCurrentLocation);
  window.addEventListener('resize', revealCurrentLocation);
  try {
    const root = resolve(typeof settings.root === 'string' && settings.root ? settings.root : '~', fs.home);
    if (root.type !== 'directory') throw Error('not_directory');
    boundary = fs.pathOf(root);
  } catch {
    locationInput.disabled = true; editPath.disabled = true; search.disabled = true; sort.disabled = true;
    fail('文件管理的起始范围无效，请检查配置。');
    window.blanktimeFiles = {openPath:() => false, openFile:() => false, getCwd:() => '', selectFile:() => {}};
    return;
  }
  sidebarExpanded.add(boundary);
  let initial = boundary;
  try { initial = fs.pathOf(directory(typeof settings.default_path === 'string' && settings.default_path ? settings.default_path : boundary)); } catch {}
  navigate(initial);
  document.addEventListener('blanktime:filesystem-changed', refreshMusicDirectory);
  window.blanktimeFiles = {
    openPath(path) {
      if (!navigate(path)) return false;
      window.blanktimeDesktop.openWindow(win);
      return true;
    },
    openFile(path) {
      try {
        const node = resolve(path);
        if (!managed(fs.pathOf(node))) throw Error('outside_scope');
        if (node.type === 'directory') throw Error('not_file');
        return openNode(node);
      } catch (cause) { return showFailure(cause); }
    },
    getCwd:() => cwd,
    selectFile:setSelected
  };
})();
