(() => {
  'use strict';
  const win = document.getElementById('wallpaper-settings');
  const choices = [...win.querySelectorAll('.wallpaper-choice')];
  const preview = document.getElementById('wallpaper-current-image');
  const currentName = document.getElementById('wallpaper-current-name');
  const defaultSrc = win.dataset.defaultSrc;
  const live = window.blanktimeLiveWallpaper;
  const koiButton = document.getElementById('wallpaper-koi');
  const koiPreview = document.getElementById('wallpaper-current-koi');
  const koiStatus = document.getElementById('wallpaper-koi-status');
  const wallpaper = document.querySelector('.wallpaper');
  const absolute = src => new URL(src, location.href).href;
  const images = new Map(choices.map(button => [absolute(button.dataset.src), button]));
  let current = {src:defaultSrc, name:'默认壁纸'};
  let opened = false;
  function notify(message) {
    for (const id of ['album-status', 'wallpaper-status']) {
      const feedback = document.getElementById(id);
      if (feedback) feedback.textContent = message;
    }
    window.dispatchEvent(new CustomEvent('blanktime:wallpaper-feedback', {detail:message}));
  }
  function syncSelection() {
    const src = current.src ? absolute(current.src) : '';
    choices.forEach(button => {
      const selected = current.kind !== 'koi' && absolute(button.dataset.src) === src;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    currentName.textContent = current.name;
    koiButton?.classList.toggle('is-selected', current.kind === 'koi');
    koiButton?.setAttribute('aria-pressed', String(current.kind === 'koi'));
    if (!opened) return;
    if (koiPreview) koiPreview.hidden = current.kind !== 'koi';
    if (current.kind === 'koi') { preview.hidden = true; return; }
    if (!src) { preview.hidden = true; preview.removeAttribute('src'); return; }
    if (preview.getAttribute('src') !== src) {
      preview.hidden = true;
      preview.src = src;
    } else if (preview.complete && preview.naturalWidth) preview.hidden = false;
  }
  preview.addEventListener('load', () => { preview.hidden = current.kind === 'koi'; });
  preview.addEventListener('error', () => { preview.hidden = true; });
  function syncLiveStatus() {
    if (!koiStatus || !live) return;
    const state = live.getState();
    koiStatus.hidden = !state.selected;
    const messages = {
      loading:'正在加载锦鲤池…', error:'加载失败 · 点击锦鲤池重试',
      'reduced-motion':'已暂停 · 遵循减少动态效果设置',
      reading:'已暂停 · 返回桌面后继续', covered:'已暂停 · 返回桌面后继续',
      fullscreen:'已暂停 · 退出全屏后继续', hidden:'已暂停', animation:'已暂停 · 窗口动画结束后继续'
    };
    koiStatus.textContent = state.running ? '正在播放' : messages[state.reason] || '';
    koiButton?.classList.toggle('is-pending', state.reason === 'loading');
    koiButton?.setAttribute('aria-busy', String(state.reason === 'loading'));
  }
  window.addEventListener('blanktime:live-wallpaper-state', syncLiveStatus);
  const koiSettings = document.getElementById('wallpaper-koi-settings');
  if (koiSettings && live?.getSettings) {
    const profileLabel = document.getElementById('wallpaper-koi-profile');
    const settingsReset = document.getElementById('wallpaper-koi-settings-reset');
    const settingsStatus = document.getElementById('wallpaper-koi-settings-status');
    const nativeResolution = document.getElementById('wallpaper-koi-native-resolution');
    const fields = [
      {key:'fps', id:'wallpaper-koi-fps', unit:' FPS'},
      {key:'fish_count', id:'wallpaper-koi-fish-count', unit:' 条'},
      {key:'fish_size', id:'wallpaper-koi-fish-size', unit:'×'},
      {key:'fish_speed', id:'wallpaper-koi-fish-speed', unit:'×'},
      {key:'max_dpr', id:'wallpaper-koi-max-dpr', unit:'×'}
    ].map(field => ({...field, input:document.getElementById(field.id), output:document.getElementById(field.id+'-value')}));
    const sizeField = fields.find(field => field.key === 'fish_size');
    let sizePreview;
    let previewFrame = 0;
    let ignoreSizeChange = false;
    function clearPreviewUI() {
      const previous = sizePreview;
      sizePreview = undefined;
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = 0;
      document.body.classList.remove('koi-size-preview');
      if (previous && sizeField.input.hasPointerCapture?.(previous.pointerId)) {
        sizeField.input.releasePointerCapture(previous.pointerId);
      }
    }
    function finishSizePreview(commit) {
      if (!sizePreview) return;
      commit = commit && sizePreview.profile === live.getSettings().profile;
      // Flush the last input before a pointerup that arrives ahead of the next frame.
      if (commit) live.previewSettings({fish_size:Number(sizeField.input.value)});
      ignoreSizeChange = true;
      clearPreviewUI();
      live.finishPreview({commit});
      syncSettings();
    }
    function startSizePreview(event) {
      if (event.button !== 0 || event.isPrimary === false || sizePreview) return;
      ignoreSizeChange = false;
      if (!live.previewSettings || !live.finishPreview || live.getSettings().profile !== 'mobile') return;
      sizePreview = {profile:'mobile', pointerId:event.pointerId};
      if (!live.previewSettings({fish_size:Number(sizeField.input.value)})) {
        sizePreview = undefined;
        return;
      }
      document.body.classList.add('koi-size-preview');
      // The original input stays in place so the thumb does not move under the finger.
      try { sizeField.input.setPointerCapture?.(event.pointerId); } catch {}
    }
    function queueSizePreview() {
      if (!sizePreview || previewFrame) return;
      previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        if (sizePreview && !live.previewSettings({fish_size:Number(sizeField.input.value)})) finishSizePreview(false);
      });
    }
    sizeField.input.addEventListener('pointerdown', startSizePreview);
    sizeField.input.addEventListener('keydown', () => { ignoreSizeChange = false; });
    sizeField.input.addEventListener('lostpointercapture', event => {
      if (sizePreview?.pointerId === event.pointerId) finishSizePreview(false);
    });
    window.addEventListener('pointerup', event => {
      if (sizePreview?.pointerId === event.pointerId) finishSizePreview(true);
    }, true);
    window.addEventListener('pointercancel', event => {
      if (sizePreview?.pointerId === event.pointerId) finishSizePreview(false);
    }, true);
    window.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !sizePreview) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishSizePreview(false);
    }, true);
    window.addEventListener('blur', () => finishSizePreview(false));
    window.addEventListener('resize', () => finishSizePreview(false));
    window.addEventListener('pagehide', () => finishSizePreview(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) finishSizePreview(false); });
    win.addEventListener('blanktime:window-hidden', () => finishSizePreview(false));
    window.addEventListener('blanktime:live-wallpaper-preview', event => {
      if (event.detail?.active || !sizePreview) return;
      ignoreSizeChange = true;
      clearPreviewUI();
      syncSettings();
    });
    function showValue(field) {
      const text = Number(field.input.value)+field.unit;
      field.output.textContent = text;
      field.input.setAttribute('aria-valuetext', text);
    }
    function syncSettings() {
      const settings = live.getSettings();
      profileLabel.textContent = settings.profile === 'mobile' ? '移动端' : '桌面';
      fields.forEach(field => {
        if (field !== sizeField || !sizePreview) field.input.value = settings.values[field.key];
        field.input.disabled = field.key === 'max_dpr' && settings.values.native_resolution;
        showValue(field);
      });
      nativeResolution.checked = settings.values.native_resolution;
      settingsReset.disabled = !settings.customized && settings.persistent;
      settingsStatus.hidden = settings.persistent;
      settingsStatus.textContent = settings.persistent ? '' : '当前浏览器无法保存参数，本次调整仍会生效。';
    }
    fields.forEach(field => {
      let editingProfile;
      field.input.addEventListener('input', () => {
        editingProfile = live.getSettings().profile;
        showValue(field);
        if (field === sizeField) queueSizePreview();
      });
      field.input.addEventListener('change', () => {
        if (field === sizeField && (sizePreview || ignoreSizeChange)) {
          if (sizePreview) finishSizePreview(true);
          // Native ranges may emit change before or after pointerup; save once.
          else ignoreSizeChange = false;
          editingProfile = undefined;
          syncSettings();
          return;
        }
        // A responsive layout change must not apply a desktop edit to the mobile profile.
        if (!editingProfile || editingProfile === live.getSettings().profile) live.updateSettings({[field.key]:Number(field.input.value)});
        editingProfile = undefined;
        syncSettings();
      });
    });
    nativeResolution.addEventListener('change', () => {
      live.updateSettings({native_resolution:nativeResolution.checked});
      syncSettings();
    });
    settingsReset.addEventListener('click', () => { live.resetSettings(); syncSettings(); });
    window.addEventListener('blanktime:live-wallpaper-settings', syncSettings);
    win.addEventListener('blanktime:window-opened', syncSettings);
    syncSettings();
  } else if (koiSettings) koiSettings.hidden = true;
  function pending(src = '') {
    choices.forEach(button => {
      const busy = !!src && absolute(button.dataset.src) === src;
      button.classList.toggle('is-pending', busy);
      button.setAttribute('aria-busy', String(busy));
    });
  }
  function loadThumbnail(button) {
    const img = button.querySelector('img');
    if (img.hasAttribute('src')) return;
    const src = button.dataset.previewSrc;
    const state = button.querySelector('.wallpaper-choice-state');
    if (!src) {
      button.dataset.loadState = 'placeholder';
      state.textContent = '点击加载原图';
      return;
    }
    button.dataset.loadState = 'loading';
    state.textContent = '正在加载…';
    img.addEventListener('load', () => {
      button.dataset.loadState = 'loaded'; state.textContent = '';
    }, {once:true});
    img.addEventListener('error', () => {
      button.dataset.loadState = 'error'; state.textContent = '预览不可用 · 点击应用';
    }, {once:true});
    img.src = src;
  }
  win.addEventListener('blanktime:window-opened', () => {
    opened = true;
    choices.forEach(loadThumbnail);
    syncSelection();
  });
  let revision = 0;
  // Store only a URL selected from the configured wallpaper folder.
  const database = new Promise((resolve,reject) => {
    const request = indexedDB.open('blanktime-appearance',1);
    request.onupgradeneeded = () => request.result.createObjectStore('preferences');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function storage(value, write = false) {
    const db = await database;
    return new Promise((resolve,reject) => {
      const tx = db.transaction('preferences',write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('preferences');
      const request = write ? (value === null ? store.delete('wallpaper') : store.put(value,'wallpaper')) : store.get('wallpaper');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function imageURL(text) {
    if (!/^https?:\/\//i.test(text) && !/^\/(?!\/)/.test(text)) throw new Error('请输入 HTTP(S) 图片链接或以 / 开头的本站图片路径。');
    const url = new URL(text,location.origin);
    if (!/^https?:$/.test(url.protocol)) throw new Error('图片地址无效。');
    return url.href;
  }
  function checkImage(src) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      const timer = setTimeout(() => {img.src='';reject(new Error('图片加载超时，请检查链接。'));},15000);
      img.onload = () => {clearTimeout(timer);resolve();};
      img.onerror = () => {clearTimeout(timer);reject(new Error('图片无法加载，请检查地址或图片格式。'));};
      img.src = src;
    });
  }
  async function apply(value, persist = true) {
    const request = ++revision;
    // A new image choice cancels a pond still loading behind an unchanged static wallpaper.
    if (value?.kind !== 'koi' && current.kind !== 'koi' && live?.getState().selected) live.clear();
    pending();
    if (persist) notify('正在加载图片…');
    try {
      if (value?.kind === 'koi' && live) {
        if (!await live.select({manual:persist}) || request !== revision) return;
        current = {kind:'koi', src:'', name:'锦鲤池'};
        syncSelection(); syncLiveStatus();
        if (persist) {
          try { await storage({kind:'koi'}, true); if (request === revision) notify('已选择锦鲤池。'); }
          catch { if (request === revision) notify('已选择锦鲤池，但浏览器无法保存。'); }
        }
        return;
      }
      const src = value?.kind === 'url' ? imageURL(value.url) : '';
      if (!images.has(src)) {
        if (!persist) { await storage(null, true); return; }
        throw new Error('只能将壁纸文件夹中的图片设为壁纸。');
      }
      pending(src);
      await checkImage(src);
      if (request !== revision) return;
      live?.clear();
      wallpaper.style.backgroundImage='url('+JSON.stringify(src)+')';
      current = {src, name:images.get(src).dataset.name};
      syncSelection();
      if (persist) {
        try {await storage(value,true);if(request===revision)notify('壁纸已更换并保存在当前浏览器。');}
        catch {if(request===revision)notify('壁纸已更换，但浏览器无法保存，下次刷新后会恢复默认。');}
      }
    } catch(error) {
      if(request===revision)notify(error.message);
    } finally {
      if(request===revision)pending();
    }
  }
  choices.forEach(button => button.addEventListener('click', () => {
    apply({kind:'url', url:button.dataset.src});
  }));
  koiButton?.addEventListener('click', () => apply({kind:'koi'}));
  window.addEventListener('blanktime:set-wallpaper',event => {
    if (event.detail) apply(event.detail);
  });
  document.getElementById('wallpaper-reset').addEventListener('click',async () => {
    const request=++revision;
    pending();
    live?.clear();
    wallpaper.style.removeProperty('background-image');
    current = {src:defaultSrc, name:'默认壁纸'};
    syncSelection();
    try {await storage(null,true);if(request===revision)notify('已恢复默认壁纸。');}
    catch {if(request===revision)notify('已恢复默认，但浏览器无法清除保存的偏好。');}
  });
  const initialRevision=revision;
  syncSelection();
  syncLiveStatus();
  storage().then(value => {if(value && revision===initialRevision)apply(value,false);}).catch(() => {});
})();
