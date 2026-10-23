(() => {
  'use strict';
  const configElement = document.getElementById('live-wallpaper-config');
  const host = document.querySelector('.wallpaper');
  if (!configElement || !host) return;
  let config;
  try { config = JSON.parse(configElement.textContent); } catch { return; }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return;
  const mobile = matchMedia('(max-width:760px), (pointer:coarse)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const windows = [...document.querySelectorAll('.app-window')];
  let selected = false, running = false, pageHidden = false;
  let renderer, canvas, profile, appliedSettings, loading, generation = 0, queued = false, failed = false;
  let state = {selected:false, running:false, reason:''};
  const settingsKey = 'blanktime:koi-settings:v2';
  let previewSettingsState = null;
  const limits = {fps:[10,120], fish_count:[1,24], fish_size:[0.5,3], fish_speed:[0.25,3], max_dpr:[0.5,2]};
  const settingKeys = [...Object.keys(limits), 'native_resolution'];
  const fallback = {
    desktop:{fps:30, fish_count:12, fish_size:1, fish_speed:1, max_dpr:1.25, native_resolution:false},
    mobile:{fps:24, fish_count:6, fish_size:1, fish_speed:1, max_dpr:2, native_resolution:false}
  };
  const defaults = {}, overrides = {desktop:{}, mobile:{}};
  let persistent = true;
  function normalize(value, key) {
    if (key === 'native_resolution') return typeof value === 'boolean' ? value : undefined;
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const [min, max] = limits[key];
    const clamped = Math.min(max, Math.max(min, number));
    return key === 'fps' || key === 'fish_count' ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  }
  for (const name of ['desktop','mobile']) {
    defaults[name] = {};
    for (const key of settingKeys) defaults[name][key] = normalize(config[name]?.[key], key) ?? fallback[name][key];
  }
  try {
    const savedText = localStorage.getItem(settingsKey);
    const migrating = savedText === null;
    const saved = JSON.parse(savedText ?? localStorage.getItem('blanktime:koi-settings:v1'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const name of ['desktop','mobile']) {
        const values = saved[name];
        if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
        for (const key of settingKeys) {
          const expectedType = key === 'native_resolution' ? 'boolean' : 'number';
          // Preserve an explicitly chosen old size when moving to the new device-specific baseline.
          const candidate = migrating && key === 'fish_size' && typeof values[key] === 'number'
            ? values[key] / (name === 'mobile' ? .5 : .8) : values[key];
          const value = typeof candidate === expectedType ? normalize(candidate, key) : undefined;
          if (value !== undefined && value !== defaults[name][key]) overrides[name][key] = value;
        }
      }
    }
    if (migrating) localStorage.setItem(settingsKey, JSON.stringify(overrides));
  } catch (error) {
    // Malformed JSON is disposable; blocked storage still permits session-only changes.
    if (!(error instanceof SyntaxError)) persistent = false;
  }
  const settingsProfile = () => mobile.matches ? 'mobile' : 'desktop';
  function getSettings() {
    const name = settingsProfile();
    return {profile:name, values:{...defaults[name], ...overrides[name], ...(previewSettingsState?.profile === name ? previewSettingsState.values : {})}, defaults:{...defaults[name]},
      customized:Object.keys(overrides[name]).length > 0, persistent};
  }
  function publishSettings() {
    const settings = getSettings();
    window.dispatchEvent(new CustomEvent('blanktime:live-wallpaper-settings', {detail:settings}));
    return settings;
  }
  function saveSettings() {
    try {
      // Keep an empty v2 value as a migration marker so old v1 settings cannot reappear after reset.
      localStorage.setItem(settingsKey, JSON.stringify(overrides));
      persistent = true;
    } catch { persistent = false; }
    schedule();
    return publishSettings();
  }
  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return getSettings();
    const name = settingsProfile();
    for (const key of settingKeys) {
      if (!Object.hasOwn(patch, key)) continue;
      const value = normalize(patch[key], key);
      if (value === undefined) continue;
      if (value === defaults[name][key]) delete overrides[name][key];
      else overrides[name][key] = value;
    }
    return saveSettings();
  }
  function resetSettings() {
    finishPreview();
    overrides[settingsProfile()] = {};
    return saveSettings();
  }

  function publishPreview(active) {
    window.dispatchEvent(new CustomEvent('blanktime:live-wallpaper-preview', {detail:{active}}));
  }
  function previewSettings(patch) {
    if (!selected || !mobile.matches || document.hidden || pageHidden || !patch) return false;
    const value = normalize(patch.fish_size, 'fish_size');
    if (value === undefined) return false;
    const starting = !previewSettingsState;
    previewSettingsState = {profile:settingsProfile(), values:{fish_size:value}};
    if (starting) publishPreview(true);
    schedule();
    return true;
  }
  function finishPreview({commit = false} = {}) {
    const preview = previewSettingsState;
    if (!preview) return getSettings();
    previewSettingsState = null;
    publishPreview(false);
    if (commit && preview.profile === settingsProfile()) return updateSettings(preview.values);
    schedule();
    return publishSettings();
  }

  function publish(reason = '') {
    if (canvas) canvas.dataset.running = String(running);
    if (state.selected === selected && state.running === running && state.reason === reason) return;
    state = {selected, running, reason};
    window.dispatchEvent(new CustomEvent('blanktime:live-wallpaper-state', {detail:{...state}}));
  }
  function reasonToPause() {
    if (document.hidden || pageHidden) return 'hidden';
    if (reduced.matches) return 'reduced-motion';
    if (document.fullscreenElement) return 'fullscreen';
    // The mobile preview hides application chrome without changing any window's actual state.
    if (previewSettingsState) return '';
    for (const win of windows) {
      if (win.hidden) continue;
      if (win.dataset.windowMotion === 'true' || /(?:music|album|files|browser)-is-(?:starting|closing)/.test(win.className)) return 'animation';
      if (win.dataset.state && win.dataset.state !== 'open') continue;
      if (win.classList.contains('is-maximized')) return 'covered';
      if (win.id === 'browser' && win.querySelector('.browser-article-page:not([hidden])')) return 'reading';
      const rect = win.getBoundingClientRect();
      const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
      const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      if (width * height >= innerWidth * innerHeight * .78) return 'covered';
    }
    return '';
  }
  function loadRenderer() {
    if (window.blanktimeKoi) return Promise.resolve();
    if (loading) return loading;
    const task = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.src; script.async = true;
      const finish = error => {
        clearTimeout(timer); script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('锦鲤壁纸加载超时，请重试。')), 10000);
      script.onload = () => finish(typeof window.blanktimeKoi?.create === 'function' ? null : new Error('锦鲤壁纸暂不可用，请重试。'));
      script.onerror = () => finish(new Error('锦鲤壁纸加载失败，请重试。'));
      document.head.append(script);
    });
    loading = task;
    task.catch(() => { if (loading === task) loading = null; });
    return task;
  }
  function release() {
    renderer?.destroy(); renderer = null;
    canvas?.remove(); canvas = null; profile = null; appliedSettings = null; running = false;
    host.classList.remove('has-live-wallpaper');
  }
  async function reconcile() {
    if (!selected) return false;
    const reason = reasonToPause();
    if (reason === 'hidden' || failed) {
      renderer?.pause(); running = false; publish(failed ? 'error' : reason); return true;
    }
    const request = generation;
    try {
      if (!window.blanktimeKoi) publish('loading');
      await loadRenderer();
      if (!selected || request !== generation) return false;
      const blocked = reasonToPause();
      if (blocked === 'hidden') { renderer?.pause(); running = false; publish(blocked); return true; }
      const {profile:nextProfile, values:options} = getSettings();
      const signature = JSON.stringify(options);
      const rendererOptions = {
        fps:options.fps, fishCount:options.fish_count, fishSize:options.fish_size * (nextProfile === 'mobile' ? .5 : .8), fishSpeed:options.fish_speed,
        maxDpr:options.max_dpr, nativeResolution:options.native_resolution,
        maxPixels:options.native_resolution ? 16000000 : mobile.matches ? 1500000 : 4000000,
        shadows:!mobile.matches, caustics:!mobile.matches
      };
      if (renderer && profile !== nextProfile) release();
      if (!renderer) {
        canvas = document.createElement('canvas');
        canvas.className = 'koi-wallpaper'; canvas.setAttribute('aria-hidden', 'true');
        host.append(canvas);
        renderer = window.blanktimeKoi.create(canvas, rendererOptions);
        profile = nextProfile;
        appliedSettings = signature;
        host.classList.add('has-live-wallpaper');
      } else if (appliedSettings !== signature) {
        renderer.updateOptions(rendererOptions);
        appliedSettings = signature;
      }
      // Creation draws one still frame even when motion is paused; the selected pond stays visible.
      if (blocked) { renderer.pause(); running = false; publish(blocked); }
      else { renderer.start(); running = true; publish(); }
      return true;
    } catch (error) {
      if (!selected || request !== generation) return false;
      release(); failed = true; publish('error'); throw error;
    }
  }
  function schedule() {
    if (!selected || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; reconcile().catch(() => {}); });
  }
  async function select() {
    finishPreview();
    generation++; selected = true; failed = false;
    watch();
    return reconcile();
  }
  function clear() {
    generation++; selected = false; failed = false;
    finishPreview();
    unwatch();
    release(); publish();
  }
  const observer = new MutationObserver(schedule);
  const pages = document.querySelector('.browser-pages');
  // Only bare desktop space is interactive; application clicks must never feed fish.
  const bareDesktop = target => target instanceof Element && target.matches('body, html, .desktop, .wallpaper');
  function move(event) {
    if (!running) return;
    if (!bareDesktop(event.target) || event.pointerType === 'touch') { renderer.pointerLeave(); return; }
    renderer.pointerMove(event.clientX, event.clientY);
  }
  function feed(event) {
    if (running && event.button === 0 && !event.defaultPrevented && bareDesktop(event.target)) renderer.feed(event.clientX, event.clientY);
  }
  const leave = () => renderer?.pointerLeave();
  const listeners = [
    [document, 'visibilitychange', () => { if (document.hidden) finishPreview(); schedule(); }], [document, 'fullscreenchange', schedule],
    [window, 'pagehide', () => { pageHidden = true; finishPreview(); renderer?.pause(); running = false; publish('hidden'); }],
    [window, 'pageshow', () => { pageHidden = false; schedule(); }],
    [window, 'resize', () => { renderer?.resize(innerWidth, innerHeight); schedule(); }],
    [reduced, 'change', schedule],
    [window, 'pointermove', move, {passive:true}], [document, 'pointerleave', leave, {passive:true}],
    [window, 'blur', leave], [window, 'click', feed],
    ...windows.flatMap(win => [[win, 'blanktime:window-opened', schedule], [win, 'blanktime:window-hidden', schedule]])
  ];
  let watching = false;
  function watch() {
    if (watching) return;
    watching = true; pageHidden = false;
    windows.forEach(win => observer.observe(win, {attributes:true, attributeFilter:['hidden','class','style','data-state','data-window-motion']}));
    if (pages) observer.observe(pages, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden']});
    listeners.forEach(([target, type, handler, options]) => target.addEventListener(type, handler, options));
  }
  function unwatch() {
    watching = false;
    observer.disconnect();
    listeners.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
  }
  // Keep the settings panel's device profile current even while a static wallpaper is selected.
  mobile.addEventListener('change', () => { finishPreview(); publishSettings(); schedule(); });
  window.blanktimeLiveWallpaper = {select, clear, getState:() => ({...state}), getSettings, updateSettings, resetSettings, previewSettings, finishPreview};
})();
