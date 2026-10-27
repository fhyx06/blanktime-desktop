(() => {
  'use strict';
  const win = document.getElementById('file-details');
  if (!win || !window.blanktimeFS) return;
  const $ = name => document.getElementById('file-details-' + name);
  const formats = {'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP','image/gif':'GIF',
    'image/avif':'AVIF','image/bmp':'BMP','image/svg+xml':'SVG','image/x-icon':'ICO','image/vnd.microsoft.icon':'ICO','image/tiff':'TIFF'};
  let current = null, version = 0, request, timer, previewImage;
  function safeURL(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, location.href);
      return /^(https?:|blob:)$/.test(url.protocol) || /^data:image\//i.test(url.href) ? url.href : '';
    } catch { return ''; }
  }
  function stopRequest() { request?.abort(); request = null; clearTimeout(timer); }
  function field(name, value = '') {
    $(name).textContent = value;
    win.querySelector(`[data-field="${name}"]`).hidden = !value;
  }
  function byteSize(value) {
    if (value === null || value === undefined || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0) return '';
    const bytes = Number(value);
    if (bytes < 1024) return `${bytes} B`;
    const exponent = Math.min(3,Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${Number((bytes / 1024 ** exponent).toFixed(2))} ${['B','KB','MB','GB'][exponent]}（${bytes.toLocaleString('zh-CN')} 字节）`;
  }
  function dateLabel(value) {
    if (value === null || value === undefined || value === '') return '';
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return '';
    const pad = number => String(number).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function renderMetadata() {
    if (!current) return;
    const metadata = {...window.blanktimeImages?.getMetadata?.(current.url), ...current.headers};
    const match = new URL(current.url).pathname.match(/\.(jpe?g|png|webp|gif|avif|bmp|svg|ico|tiff?)$/i);
    const extension = match?.[1].toLowerCase();
    const inferred = extension ? `${extension.toUpperCase()} 文件（.${extension}）` : '';
    field('format',metadata.format ? `${metadata.format} 图片` : inferred);
    const width = Number(metadata.width), height = Number(metadata.height);
    field('resolution',Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 ? `${width} × ${height} px` : '');
    field('size',byteSize(current.node.size) || byteSize(metadata.size));
    field('modified',dateLabel(current.node.date) || dateLabel(metadata.modified));
  }
  function showPreview(node, url, token) {
    previewImage?.removeAttribute('src'); previewImage = null;
    const preview = $('preview');
    const placeholder = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','#i-album'); placeholder.append(use); preview.replaceChildren(placeholder);
    const thumbnail = safeURL(node.thumbnail);
    // Opening properties must not trigger a download of an unloaded original.
    if (!thumbnail || thumbnail === url) return;
    const image = document.createElement('img'); previewImage = image;
    image.alt = ''; image.hidden = true; image.draggable = false;
    image.addEventListener('load',() => { if (token === version) { image.hidden = false; placeholder.remove(); } });
    image.addEventListener('error',() => { image.removeAttribute('src'); image.remove(); });
    preview.append(image); image.src = thumbnail;
  }
  async function loadHeaders(token) {
    const context = current;
    if (!context || !/^https?:/.test(context.url) || ($('size').textContent && $('format').textContent)) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(),5000); timer = timeout;
    try {
      const response = await fetch(context.url,{method:'HEAD',credentials:'omit',signal:controller.signal});
      if (token !== version || controller.signal.aborted || !response.ok) return;
      const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      // A failed image endpoint may serve HTML with its own length and timestamp.
      if (!type.startsWith('image/')) return;
      const length = response.headers.get('Content-Length');
      const size = length === null || length.trim() === '' ? null : Number(length);
      current.headers = {
        ...(formats[type] ? {format:formats[type]} : {}),
        ...(byteSize(size) ? {size} : {}),
        ...(dateLabel(response.headers.get('Last-Modified')) ? {modified:response.headers.get('Last-Modified')} : {})
      };
      renderMetadata();
    } catch {} finally { clearTimeout(timeout); if (request === controller) request = null; }
  }
  function open(node) {
    if (!node || node.type !== 'image') return false;
    const url = safeURL(node.url);
    let path;
    try { path = window.blanktimeFS.pathOf(node); if (window.blanktimeFS.resolve(path) !== node) return false; } catch { return false; }
    if (!url) return false;
    stopRequest(); const token = ++version;
    current = {node,url,path,headers:{}};
    $('title').textContent = `详细信息 · ${node.name}`;
    $('name').textContent = node.name; $('path').textContent = path;
    $('feedback').hidden = true;
    renderMetadata(); showPreview(node,url,token);
    window.blanktimeDesktop.openWindow(win);
    loadHeaders(token);
    return true;
  }
  $('copy').addEventListener('click',async () => {
    if (!current) return;
    const token = version, path = current.path;
    let copied = false;
    try { await navigator.clipboard.writeText(path); copied = true; } catch {}
    if (token !== version || !current) return;
    if (!copied) {
      const input = document.createElement('textarea'); input.value = path;
      input.setAttribute('aria-label','复制路径'); input.style.cssText = 'position:fixed;left:-10000px;top:0;';
      win.append(input); input.select();
      try { copied = document.execCommand('copy'); } catch {}
      input.remove(); $('copy').focus({preventScroll:true});
    }
    $('feedback').textContent = copied ? '已复制路径' : '复制失败，请选中路径后手动复制'; $('feedback').hidden = false;
  });
  window.addEventListener('blanktime:image-metadata',event => { if (current?.url === event.detail?.url) renderMetadata(); });
  win.addEventListener('blanktime:window-hidden',event => {
    if (event.detail?.state !== 'closed') return;
    ++version; stopRequest(); current = null; previewImage?.removeAttribute('src');
  });
  win.addEventListener('keydown',event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation(); window.blanktimeDesktop.closeWindow(win);
  });
  window.blanktimeFileDetails = {open};
})();
