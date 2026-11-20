// 安装成应用（PWA）的页面一侧：
// 1. 安装：Chrome / Edge / 安卓浏览器用系统的安装弹窗；iPhone / iPad 没有安装弹窗，改为图示“分享 → 添加到主屏幕”；
//    已经以应用形式打开时不再提供安装入口。设置面板与桌面右键通过 window.blanktimePWA 调用。
// 2. 离线与缓存：注册 Service Worker，并在站点更新后提示访客刷新。
//    本地开发（localhost）默认不注册，免得缓存干扰调试；需要调试时在地址后加 ?sw=on 开启、?sw=off 关闭。
(() => {
  'use strict';
  const script = document.currentScript;
  const html = document.documentElement;
  const api = window.blanktimePWA = {...window.blanktimePWA};

  // ---------- 安装 ----------
  const standaloneQuery = matchMedia('(display-mode: standalone)');
  const isStandalone = () => standaloneQuery.matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null, guide = null, guideFocus = null, popClose = false;
  // 以应用形式打开时给 <html> 加上标记，尽早设置，供样式按应用模式调整。
  const mark = () => { if (isStandalone()) html.dataset.display = 'standalone'; else delete html.dataset.display; };
  const changed = () => {
    mark();
    document.dispatchEvent(new CustomEvent('blanktime:pwa-change', {detail:{canInstall:api.canInstall()}}));
  };
  api.isStandalone = isStandalone;
  api.canInstall = () => !isStandalone() && Boolean(deferred || isIOS);
  addEventListener('beforeinstallprompt', event => {
    // 不让浏览器自己弹横幅，改由设置面板与右键菜单提供入口。
    event.preventDefault();
    deferred = event;
    changed();
  });
  addEventListener('appinstalled', () => { deferred = null; changed(); });
  standaloneQuery.addEventListener?.('change', changed);
  api.install = async () => {
    if (deferred) {
      const prompt = deferred;
      deferred = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch {}
      changed();
      return;
    }
    if (isIOS) showGuide();
  };

  function step(number, text, icon) {
    const row = document.createElement('li');
    row.innerHTML = `<span class="install-guide-number">${number}</span><span class="install-guide-text"></span>${icon ? `<span class="install-guide-icon" aria-hidden="true">${icon}</span>` : ''}`;
    row.querySelector('.install-guide-text').textContent = text;
    return row;
  }
  function showGuide() {
    if (guide && !guide.hidden) return;
    guideFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!guide) {
      guide = document.createElement('div');
      guide.className = 'install-guide';
      guide.innerHTML = '<div class="install-guide-backdrop" data-install-close></div><div class="install-guide-card" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabindex="-1"></div>';
      const card = guide.querySelector('.install-guide-card');
      const icon = document.querySelector('link[rel="apple-touch-icon"]')?.href;
      card.innerHTML = `${icon ? `<img class="install-guide-app" src="${icon}" alt="">` : ''}<h2 id="install-guide-title">添加到主屏幕</h2><p>添加后从主屏幕打开，没有地址栏和工具栏，屏幕空间更大。</p>`;
      const list = document.createElement('ol');
      list.append(
        step(1, isIPad() ? '点地址栏右侧的“分享”按钮' : '点浏览器底部的“分享”按钮', '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>'),
        step(2, '在菜单中选择“添加到主屏幕”', '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>'),
        step(3, '点右上角的“添加”')
      );
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'install-guide-done';
      done.dataset.installClose = '';
      done.textContent = '知道了';
      card.append(list, done);
      guide.addEventListener('click', event => { if (event.target.closest('[data-install-close]')) hideGuide(); });
      guide.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideGuide(); } });
      document.body.append(guide);
    }
    guide.hidden = false;
    html.dataset.overlay = 'install';
    guide.querySelector('.install-guide-card').focus({preventScroll:true});
  }
  function hideGuide(restore = true) {
    if (!guide || guide.hidden) return;
    guide.hidden = true;
    const release = () => { if (guide.hidden && html.dataset.overlay === 'install') delete html.dataset.overlay; };
    // 由返回键触发时，等返回键逻辑先看到“指引打开中”再清除标记，避免误关下面的窗口。
    if (popClose) setTimeout(release); else release();
    if (restore && guideFocus?.isConnected) guideFocus.focus({preventScroll:true});
    guideFocus = null;
  }
  const isIPad = () => /ipad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  addEventListener('popstate', () => {
    if (!guide || guide.hidden) return;
    popClose = true;
    hideGuide(false);
    popClose = false;
  }, true);
  api.closeGuide = hideGuide;
  mark();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', changed, {once:true}); else changed();

  // ---------- 标题栏颜色：深色模式下换成深色，免得浏览器或应用窗口顶上一条亮色 ----------
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const lightColor = themeMeta?.content, darkColor = script?.dataset.themeDark;
  const syncThemeColor = () => {
    if (themeMeta && darkColor) themeMeta.content = html.dataset.systemTheme === 'dark' ? darkColor : lightColor;
  };
  document.addEventListener('blanktime:system-theme', syncThemeColor);
  syncThemeColor();

  // ---------- 离线与缓存 ----------
  if (!('serviceWorker' in navigator) || !script?.dataset.sw) return;
  const url = script.dataset.sw, scope = script.dataset.scope || '/';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
  const FLAG = 'blanktime:sw-dev';
  const flag = new URLSearchParams(location.search).get('sw');
  try {
    if (flag === 'on') localStorage.setItem(FLAG, '1');
    if (flag === 'off') localStorage.removeItem(FLAG);
  } catch {}
  let enabled = !local;
  try { enabled ||= localStorage.getItem(FLAG) === '1'; } catch {}
  if (!enabled) {
    // 本地关闭时顺手注销之前注册过的，回到不经缓存的状态。
    navigator.serviceWorker.getRegistrations?.().then(list => list.forEach(registration => registration.unregister())).catch(() => {});
    return;
  }

  let notice = null;
  function showUpdate() {
    if (notice) return;
    notice = document.createElement('div');
    notice.className = 'toast app-update';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = '站点已更新，刷新后使用新版本。';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '刷新';
    reload.addEventListener('click', () => location.reload());
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'app-update-later';
    later.textContent = '稍后';
    later.addEventListener('click', () => notice.hidden = true);
    notice.append(text, reload, later);
    document.body.append(notice);
  }

  // 已经由旧版本接管的页面，在新版本接管时提示刷新；第一次安装不提示。
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
  const register = () => navigator.serviceWorker.register(url, {scope}).then(registration => {
    api.registration = registration;
    // 长时间开着的页面每小时检查一次更新。
    setInterval(() => registration.update().catch(() => {}), 36e5);
  }).catch(() => {});
  if (document.readyState === 'complete') register(); else addEventListener('load', register, {once:true});
  api.showUpdate = showUpdate;
})();
