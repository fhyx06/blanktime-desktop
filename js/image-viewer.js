(() => {
  'use strict';
  const win = document.getElementById('image-viewer');
  const $ = name => document.getElementById('image-viewer-' + name);
  const stage = $('stage'), message = $('message'), status = $('status'), apply = $('wallpaper');
  let imageTimer;
  let items = [], index = 0, trigger, source = '', photo, version = 0, awaitingWallpaper = false;
  const controls = ['zoom-out','zoom-in','actual','fit','rotate-left','rotate-right'].map($);
  const MAX_ZOOM = 8, PADDING = 32;
  let naturalWidth = 0, naturalHeight = 0, scale = 1, angle = 0, mode = 'fit', panX = 0, panY = 0, drag, pinch;
  const pointers = new Map();
  const mobile = window.matchMedia?.('(max-width:760px)');
  const chrome = [...win.querySelectorAll('[data-image-viewer-chrome]')];
  let controlsVisible = false, tap;
  function setControlsVisible(visible) {
    controlsVisible = visible;
    const hidden = !!mobile?.matches && !visible;
    win.classList.toggle('is-controls-hidden',hidden);
    if (hidden && chrome.some(element => element.contains(document.activeElement))) $('toggle').focus({preventScroll:true});
    chrome.forEach(element => {
      element.inert = hidden;
      if (hidden) element.setAttribute('aria-hidden','true');
      else element.removeAttribute('aria-hidden');
    });
    const label = hidden ? '显示图片操作' : '隐藏图片操作';
    $('toggle').setAttribute('aria-expanded',String(!hidden));
    $('toggle').setAttribute('aria-label',label);
    $('toggle').title = label;
  }
  $('toggle').addEventListener('click',() => setControlsVisible(!controlsVisible));
  mobile?.addEventListener('change',() => { endGesture(); setControlsVisible(false); draw(); });
  setControlsVisible(false);
  const ready = () => naturalWidth > 0 && naturalHeight > 0;
  function rotatedSize() {
    return angle % 180 === 0 ? [naturalWidth, naturalHeight] : [naturalHeight, naturalWidth];
  }
  function fitScale() {
    const [width, height] = rotatedSize();
    return Math.min(1, Math.max(1,stage.clientWidth - PADDING) / width, Math.max(1,stage.clientHeight - PADDING) / height);
  }
  function bounds() {
    const [width, height] = rotatedSize();
    return [Math.max(0,(width * scale - Math.max(1,stage.clientWidth - PADDING)) / 2),
      Math.max(0,(height * scale - Math.max(1,stage.clientHeight - PADDING)) / 2)];
  }
  function endGesture() {
    const ids = [...pointers.keys()];
    pointers.clear(); drag = null; pinch = null; tap = null;
    stage.classList.remove('is-panning');
    ids.forEach(id => { if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id); });
  }
  function draw() {
    controls.forEach(button => { button.disabled = !ready(); });
    $('fit').setAttribute('aria-pressed',String(mode === 'fit'));
    $('actual').setAttribute('aria-pressed',String(mode === 'manual' && scale === 1));
    if (!ready()) { $('zoom').textContent = '—'; stage.classList.remove('can-pan'); return; }
    // Hidden/minimized windows have no usable viewport; retain their current view.
    if (!stage.clientWidth || !stage.clientHeight) return;
    if (mode === 'fit') { scale = fitScale(); panX = 0; panY = 0; }
    const [limitX, limitY] = bounds();
    panX = Math.max(-limitX,Math.min(limitX,panX));
    panY = Math.max(-limitY,Math.min(limitY,panY));
    photo.style.width = `${naturalWidth * scale}px`;
    photo.style.height = `${naturalHeight * scale}px`;
    photo.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) rotate(${angle}deg)`;
    stage.classList.toggle('can-pan',limitX > .5 || limitY > .5);
    $('zoom').textContent = `${Number((scale * 100).toFixed(1))}%`;
    $('zoom-out').disabled = scale <= Math.min(.05,fitScale()) + 1e-8;
    $('zoom-in').disabled = scale >= MAX_ZOOM;
  }
  function resetView() {
    endGesture(); naturalWidth = 0; naturalHeight = 0; scale = 1; angle = 0; mode = 'fit'; panX = 0; panY = 0; draw();
  }
  const clampScale = value => Math.max(Math.min(.05,fitScale()),Math.min(MAX_ZOOM,value));
  function zoomTo(value, anchorX = 0, anchorY = 0) {
    if (!ready()) return;
    endGesture();
    const next = clampScale(value);
    // Keep the image point beneath the anchor fixed, within the image bounds.
    const ratio = next / scale;
    panX = anchorX + (panX - anchorX) * ratio;
    panY = anchorY + (panY - anchorY) * ratio;
    scale = next; mode = 'manual'; draw();
  }
  stage.addEventListener('wheel', event => {
    // Keep browser zoom shortcuts and horizontal trackpad scrolling intact.
    if (!ready() || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
    const delta = Math.max(-120,Math.min(120,event.deltaY * unit));
    zoomTo(scale * Math.exp(-delta * .002),event.clientX - rect.left - rect.width / 2,event.clientY - rect.top - rect.height / 2);
  }, {passive:false});
  $('zoom-out').addEventListener('click', () => zoomTo(scale / 1.25));
  $('zoom-in').addEventListener('click', () => zoomTo(scale * 1.25));
  $('actual').addEventListener('click', () => { if (ready()) { panX = 0; panY = 0; zoomTo(1); } });
  $('fit').addEventListener('click', () => { if (ready()) { endGesture(); mode = 'fit'; draw(); } });
  function rotate(degrees) {
    if (!ready()) return;
    endGesture(); angle = (angle + degrees + 360) % 360; panX = 0; panY = 0; draw();
  }
  $('rotate-left').addEventListener('click', () => rotate(-90));
  $('rotate-right').addEventListener('click', () => rotate(90));
  function pinchPosition() {
    const [a,b] = [...pointers.values()], rect = stage.getBoundingClientRect();
    return {distance:Math.hypot(b.x - a.x,b.y - a.y),
      x:(a.x + b.x) / 2 - rect.left - rect.width / 2,
      y:(a.y + b.y) / 2 - rect.top - rect.height / 2};
  }
  function startGesture() {
    drag = null; pinch = null;
    if (pointers.size === 2) {
      pinch = {...pinchPosition(),scale,panX,panY};
    } else if (pointers.size === 1) {
      const [id,point] = [...pointers.entries()][0];
      drag = {id,...point,panX,panY};
    }
    stage.classList.toggle('is-panning',pointers.size > 0 && stage.classList.contains('can-pan'));
  }
  stage.addEventListener('pointerdown', event => {
    // A second finger invalidates the whole tap, even after one finger lifts.
    if (pointers.size) tap = null;
    const surface = event.target === photo || event.target === stage || event.target === $('feedback') || event.target === message;
    if ((!ready() && !mobile?.matches) || win.hidden || !surface || event.button !== 0 || pointers.size >= 2) return;
    const touch = event.pointerType === 'touch';
    // Track the first finger even while the whole image fits, so the second
    // finger can start a pinch. Desktop mouse dragging requires an enlarged image.
    if (!touch && (event.isPrimary === false || pointers.size || (!mobile?.matches && (event.target !== photo || !stage.classList.contains('can-pan'))))) return;
    if (touch && [...pointers.values()].some(point => point.type !== 'touch')) return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
    if (mobile?.matches && pointers.size === 1) tap = {id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
    stage.setPointerCapture(event.pointerId);
    startGesture();
  });
  stage.addEventListener('pointermove', event => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    event.preventDefault();
    point.x = event.clientX; point.y = event.clientY;
    if (tap && Math.hypot(point.x - tap.x,point.y - tap.y) > 8) tap = null;
    if (!ready()) return;
    if (pinch) {
      const current = pinchPosition();
      // Coincident fingers have no useful scale; rebase once they separate.
      if (pinch.distance < 1) { startGesture(); return; }
      const next = clampScale(pinch.scale * current.distance / pinch.distance);
      const ratio = next / pinch.scale;
      panX = current.x + (pinch.panX - pinch.x) * ratio;
      panY = current.y + (pinch.panY - pinch.y) * ratio;
      scale = next; mode = 'manual'; draw();
    } else if (drag && stage.classList.contains('can-pan')) {
      panX = drag.panX + point.x - drag.x; panY = drag.panY + point.y - drag.y; draw();
    }
  });
  stage.addEventListener('pointerup', event => {
    if (!pointers.delete(event.pointerId)) return;
    const tapped = tap?.id === event.pointerId && performance.now() - tap.time < 400 && Math.hypot(event.clientX - tap.x,event.clientY - tap.y) <= 8;
    tap = null;
    if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    // Lifting either finger continues as a one-finger pan without a jump.
    startGesture();
    if (tapped && mobile?.matches) setControlsVisible(!controlsVisible);
  });
  ['pointercancel','lostpointercapture'].forEach(type => stage.addEventListener(type, event => {
    if (pointers.has(event.pointerId)) endGesture();
  }));
  new ResizeObserver(() => { endGesture(); draw(); }).observe(stage);
  let albumMode = false, metadataRequest, metadataTimer, fullscreenPending = false;
  const metadataCache = new Map();
  function rememberMetadata(url, values) {
    const key = safeURL(url);
    if (!key) return;
    const previous = metadataCache.get(key) || {};
    metadataCache.delete(key); metadataCache.set(key,{...previous,...values});
    if (metadataCache.size > 100) metadataCache.delete(metadataCache.keys().next().value);
    window.dispatchEvent(new CustomEvent('blanktime:image-metadata',{detail:{url:key}}));
  }
  function stopMetadata() {
    metadataRequest?.abort(); metadataRequest = null;
    clearTimeout(metadataTimer);
  }
  function sizeLabel(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const unit = bytes < 1024 ** 2 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
    const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
    return `${Number((bytes / divisor).toFixed(2))} ${unit}`;
  }
  function setMetadata(name, value = '') {
    const field = $(name);
    field.textContent = value;
    field.parentElement.hidden = !value;
    $('info').hidden = !albumMode || ![...$('info').children].some(row => !row.hidden);
  }
  async function showMetadata(item, current) {
    stopMetadata();
    ['filename','resolution','size','format'].forEach(name => setMetadata(name));
    if (!albumMode) return;
    setMetadata('filename',fileName(item.url,''));
    const ext = new URL(item.url).pathname.match(/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i)?.[1];
    setMetadata('format',ext ? `${ext.toUpperCase()}（扩展名）` : '');
    setMetadata('size',item.size !== null ? sizeLabel(item.size) : '');
    if (item.size !== null) { rememberMetadata(item.url,{size:item.size}); return; }
    if (!/^https?:/.test(item.url)) return;
    const controller = new AbortController(); metadataRequest = controller;
    const timer = setTimeout(() => controller.abort(),5000); metadataTimer = timer;
    try {
      // HEAD reads headers only; never download the image a second time for its size.
      const response = await fetch(item.url,{method:'HEAD',credentials:'omit',signal:controller.signal});
      if (current !== version || controller.signal.aborted) return;
      if (!response.ok) throw new Error('metadata unavailable');
      const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const formats = {'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP','image/gif':'GIF','image/avif':'AVIF','image/bmp':'BMP','image/svg+xml':'SVG'};
      if (formats[type]) setMetadata('format',formats[type]);
      const length = response.headers.get('Content-Length');
      const bytes = length === null || length.trim() === '' ? NaN : Number(length);
      setMetadata('size',type.startsWith('image/') && Number.isSafeInteger(bytes) && bytes >= 0 ? sizeLabel(bytes) : '');
      if (type.startsWith('image/')) rememberMetadata(item.url,{
        ...(formats[type] ? {format:formats[type]} : {}),
        ...(Number.isSafeInteger(bytes) && bytes >= 0 ? {size:bytes} : {})
      });
    } catch {
      if (current === version) setMetadata('size');
    } finally {
      clearTimeout(timer);
      if (metadataRequest === controller) metadataRequest = null;
    }
  }
  const fullscreenButton = $('fullscreen');
  fullscreenButton.disabled = !win.requestFullscreen || document.fullscreenEnabled === false;
  async function exitFullscreen() {
    if (document.fullscreenElement === win) {
      try { await document.exitFullscreen(); } catch { status.textContent = '请按 Esc 退出全屏'; }
    }
  }
  async function toggleFullscreen() {
    if (fullscreenButton.disabled || fullscreenPending) return;
    endGesture(); fullscreenPending = true;
    try {
      if (document.fullscreenElement === win) await document.exitFullscreen();
      else { await win.requestFullscreen(); if (win.hidden) await exitFullscreen(); }
    } catch { if (!win.hidden) status.textContent = '当前环境无法进入全屏，可使用窗口最大化'; }
    finally { fullscreenPending = false; }
  }
  fullscreenButton.addEventListener('click',toggleFullscreen);
  stage.addEventListener('dblclick',event => { if (!mobile?.matches && event.target === photo && ready()) { event.preventDefault(); toggleFullscreen(); } });
  document.addEventListener('fullscreenchange',() => {
    const active = document.fullscreenElement === win;
    fullscreenButton.textContent = active ? '退出全屏' : '全屏';
    fullscreenButton.setAttribute('aria-pressed',String(active));
    endGesture(); draw();
    if (!win.hidden) win.focus({preventScroll:true});
  });
  function safeURL(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return /^(https?:|blob:)$/.test(url.protocol) || /^data:image\//i.test(url.href) ? url.href : '';
    } catch { return ''; }
  }
  function fileName(url, fallback = '图片') {
    try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || fallback; }
    catch { return fallback; }
  }
  function show(next) {
    if (next < 0 || next >= items.length) return;
    clearTimeout(imageTimer);
    index = next; const item = items[index], current = ++version;
    awaitingWallpaper = false; resetView();
    showMetadata(item,current);
    if (photo) { photo.removeAttribute('src'); photo.remove(); }
    $('name').textContent = item.name;
    $('name').title = item.name;
    $('count').textContent = `${index + 1} / ${items.length}`;
    $('prev').disabled = index === 0;
    $('next').disabled = index === items.length - 1;
    apply.hidden = !item.wallpaper; apply.disabled = true;
    status.textContent = source;
    $('feedback').hidden = false; $('retry').hidden = true;
    message.hidden = false; message.textContent = '正在加载图片…';
    stage.setAttribute('aria-busy','true');
    // A separate element for each request prevents stale load/error events from
    // replacing the state of a more recently selected picture.
    const img = document.createElement('img'); photo = img;
    let settled = false;
    img.alt = item.name; img.draggable = false; img.hidden = true;
    img.addEventListener('load', () => {
      if (current !== version || settled) return;
      endGesture();
      settled = true; clearTimeout(imageTimer); $('feedback').hidden = true;
      stage.setAttribute('aria-busy','false'); message.hidden = true; img.hidden = false;
      apply.disabled = !item.wallpaper;
      naturalWidth = img.naturalWidth; naturalHeight = img.naturalHeight; draw();
      if (ready()) rememberMetadata(item.url,{width:naturalWidth,height:naturalHeight});
      if (albumMode) setMetadata('resolution',ready() ? `${naturalWidth} × ${naturalHeight} px` : '');
    });
    const fail = (timedOut = false) => {
      if (current !== version || settled) return;
      settled = true; clearTimeout(imageTimer);
      if (timedOut) img.removeAttribute('src');
      resetView(); stage.setAttribute('aria-busy','false');
      if (albumMode) setMetadata('resolution');
      message.textContent = timedOut ? 'Timeout：俺的图图呢？' : 'Error：俺的图图呢？';
      $('feedback').hidden = false; $('retry').hidden = false;
      message.hidden = false; img.hidden = true; apply.disabled = true;
    };
    img.addEventListener('error',() => fail());
    stage.append(img);
    imageTimer = setTimeout(() => fail(true),20000);
    img.src = item.url;
  }
  function open(sequence, selected = 0, context = {}) {
    const normalized = sequence.map(item => {
      const url = safeURL(item.url);
      return url ? {url, name:item.name || fileName(url), wallpaper:item.wallpaper === true, size:item.size !== undefined && item.size !== null && item.size !== '' && Number.isSafeInteger(Number(item.size)) && Number(item.size) >= 0 ? Number(item.size) : null} : null;
    });
    if (!normalized[selected]) return;
    const nextIndex = normalized.slice(0, selected).filter(Boolean).length;
    items = normalized.filter(Boolean); trigger = context.trigger; source = context.source || '';
    albumMode = context.kind === 'album';
    setControlsVisible(false);
    show(nextIndex);
    window.blanktimeDesktop.openWindow(win);
    draw();
  }
  $('retry').addEventListener('click',() => { if (items.length) show(index); });
  $('prev').addEventListener('click', () => show(index - 1));
  $('next').addEventListener('click', () => show(index + 1));
  win.addEventListener('keydown', event => {
    if (event.key === 'Tab' && mobile?.matches) setControlsVisible(true);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'Escape') {
      if (document.fullscreenElement === win) exitFullscreen();
      else window.blanktimeDesktop.closeWindow(win);
    }
    else if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === 'ArrowRight') show(index + 1);
    else return;
    event.preventDefault(); event.stopPropagation();
  });
  win.addEventListener('blanktime:window-hidden', event => {
    endGesture(); exitFullscreen();
    if (event.detail.state !== 'closed') return;
    resetView();
    ++version; clearTimeout(imageTimer); stopMetadata(); $('info').hidden = true; items = []; awaitingWallpaper = false;
    if (photo) { photo.removeAttribute('src'); photo.remove(); photo = null; }
    stage.setAttribute('aria-busy','false');
    if (trigger?.isConnected && !trigger.closest('[hidden]')) {
      const owner = trigger.closest('.app-window');
      if (owner) window.blanktimeDesktop.openWindow(owner, false);
      trigger.focus({preventScroll:true});
    }
    trigger = null;
  });
  apply.addEventListener('click', () => {
    const item = items[index];
    if (!item?.wallpaper || apply.disabled) return;
    awaitingWallpaper = true;
    window.dispatchEvent(new CustomEvent('blanktime:set-wallpaper', {detail:{kind:'url', url:item.url, name:item.name}}));
  });
  window.addEventListener('blanktime:wallpaper-feedback', event => {
    if (awaitingWallpaper && !win.hidden) status.textContent = event.detail;
  });

  function articleItem(img) {
    if (img.parentElement?.closest('button,[role=button],.code-block,.legacy-link') || img.classList.contains('emoji')) return null;
    const src = safeURL(img.currentSrc || img.getAttribute('src'));
    if (!src) return null;
    const link = img.closest('a[href]');
    let url = src;
    if (link) {
      const href = safeURL(link.href);
      // Preserve links to pages, downloads and deliberate new destinations.
      if (!href || link.hasAttribute('download') || (href !== src && !/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(new URL(href).pathname))) return null;
      url = href;
    }
    return {url, name:img.alt || img.title || fileName(url), wallpaper:false};
  }
  function prepareArticle(article) {
    const images = [...article.querySelectorAll('.article-cover img, .post-content img')];
    const sequence = images.filter(img => articleItem(img));
    sequence.forEach(img => {
      img.classList.add('image-viewer-trigger');
      if (!img.closest('a[href]')) {
        img.tabIndex = 0;
        img.setAttribute('role','button');
        img.setAttribute('aria-label','查看图片：' + articleItem(img).name);
      }
    });
    const launch = (img, event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const selected = sequence.indexOf(img);
      if (selected < 0) return;
      // Re-read currentSrc after responsive images have selected their source.
      const entries = sequence.map(image => articleItem(image));
      if (!entries[selected]) return;
      const target = entries.slice(0,selected).filter(Boolean).length;
      event.preventDefault(); event.stopPropagation();
      open(entries.filter(Boolean), target, {trigger:img.closest('a[href]') || img, source:article.dataset.title || '文章图片'});
    };
    article.addEventListener('click', event => {
      if (event.button !== 0) return;
      const img = event.target.closest('img');
      if (img) launch(img,event);
      else {
        const link = event.target.closest('a[href]');
        if (link && event.detail === 0) { const child = link.querySelector('img'); if (child) launch(child,event); }
      }
    });
    article.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('img.image-viewer-trigger')) launch(event.target,event);
    });
  }
  window.blanktimeImages = {open, prepareArticle, getMetadata(url) {
    const value = metadataCache.get(safeURL(url));
    return value ? {...value} : null;
  }};
})();
