(() => {
  'use strict';
  const win = document.getElementById('jiangshan');
  if (!win) return;
  const $ = selector => win.querySelector(selector);
  const frame = $('#jiangshan-frame');
  const feedback = $('#jiangshan-feedback');
  const message = $('#jiangshan-message');
  const retryButton = $('#jiangshan-retry');
  const modeButton = $('#jiangshan-mode');
  const reloadButton = $('#jiangshan-reload');
  const fullscreenButton = $('#jiangshan-fullscreen');
  const externalLink = $('#jiangshan-external');
  const fallbackLink = $('#jiangshan-fallback-link');
  const modeStatus = $('#jiangshan-mode-status');
  if (!frame) return;

  const baseUrl = (frame.dataset.src || 'https://deanchen.me/jiangshan-map/').trim();
  const LOAD_HINT_DELAY = 8000;
  let embedMode = false;
  let mounted = false;
  let slowTimer = 0;

  function clearSlowTimer() {
    if (!slowTimer) return;
    clearTimeout(slowTimer);
    slowTimer = 0;
  }

  function buildTargetUrl(isEmbed) {
    try {
      const url = new URL(baseUrl, location.href);
      if (isEmbed) url.searchParams.set('embed', '1');
      else url.searchParams.delete('embed');
      return url.href;
    } catch {
      if (!isEmbed) return baseUrl;
      return baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'embed=1';
    }
  }

  function syncModeUI() {
    const targetUrl = buildTargetUrl(embedMode);
    if (modeButton) {
      modeButton.setAttribute('aria-pressed', String(embedMode));
      modeButton.title = embedMode ? '切换完整视图（显示时间轴与详情侧栏）' : '切换精简视图（隐藏侧栏与介绍）';
    }
    if (modeStatus) modeStatus.textContent = embedMode ? '精简视图' : '完整视图';
    if (externalLink) externalLink.href = targetUrl;
    if (fallbackLink) fallbackLink.href = targetUrl;
  }

  function syncFullscreenUI() {
    if (!fullscreenButton) return;
    const active = document.fullscreenElement === win;
    const label = active ? '退出全屏' : '全屏浏览';
    fullscreenButton.title = label;
    fullscreenButton.setAttribute('aria-label', label);
    fullscreenButton.setAttribute('aria-pressed', String(active));
  }

  function loadFrame(force = false) {
    const targetUrl = buildTargetUrl(embedMode);
    if (mounted && !force && frame.getAttribute('src') === targetUrl) return;
    clearSlowTimer();
    mounted = true;
    win.dataset.loadState = 'loading';
    if (message) message.textContent = '正在展开历史舆图（公元前 500 年 — 1911 年）…';
    if (retryButton) retryButton.hidden = true;
    if (feedback) feedback.hidden = false;
    frame.hidden = false;
    if (force && frame.getAttribute('src') === targetUrl) {
      frame.removeAttribute('src');
    }
    frame.setAttribute('src', targetUrl);
    slowTimer = window.setTimeout(() => {
      slowTimer = 0;
      if (!mounted || win.dataset.loadState !== 'loading') return;
      if (message) message.textContent = '地图资源体积较大，若长时间未响应可重试或在新标签页打开。';
      if (retryButton) retryButton.hidden = false;
    }, LOAD_HINT_DELAY);
  }

  function unloadFrame() {
    clearSlowTimer();
    mounted = false;
    win.dataset.loadState = 'idle';
    frame.hidden = true;
    frame.removeAttribute('src');
    if (message) message.textContent = '正在展开历史舆图（公元前 500 年 — 1911 年）…';
    if (retryButton) retryButton.hidden = true;
    if (feedback) feedback.hidden = false;
  }

  frame.addEventListener('load', () => {
    if (!mounted || !frame.getAttribute('src')) return;
    clearSlowTimer();
    win.dataset.loadState = 'ready';
    if (retryButton) retryButton.hidden = true;
    if (feedback) feedback.hidden = true;
  });

  frame.addEventListener('error', () => {
    if (!mounted) return;
    clearSlowTimer();
    win.dataset.loadState = 'error';
    if (message) message.textContent = '历史舆图加载失败，请检查网络或尝试在新标签页打开。';
    if (retryButton) retryButton.hidden = false;
    if (feedback) feedback.hidden = false;
  });

  modeButton?.addEventListener('click', () => {
    embedMode = !embedMode;
    syncModeUI();
    if (mounted) loadFrame(true);
  });

  reloadButton?.addEventListener('click', () => {
    loadFrame(true);
  });

  retryButton?.addEventListener('click', () => {
    loadFrame(true);
  });

  fullscreenButton?.addEventListener('click', () => {
    if (document.fullscreenElement === win) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      win.requestFullscreen?.().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', syncFullscreenUI);

  win.addEventListener('blanktime:window-opened', () => {
    syncModeUI();
    syncFullscreenUI();
    loadFrame(false);
  });

  win.addEventListener('blanktime:window-hidden', event => {
    if (event.detail?.state !== 'closed') return;
    if (document.fullscreenElement === win) {
      document.exitFullscreen?.().catch(() => {});
    }
    unloadFrame();
  });

  syncModeUI();
  syncFullscreenUI();
})();
