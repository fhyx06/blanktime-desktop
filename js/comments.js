(() => {
  'use strict';
  let config = {};
  try { config = JSON.parse(document.getElementById('comments-config')?.textContent || '{}'); } catch {}
  function httpURL(value) {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  const server = httpURL(config.server)?.replace(/\/$/, '');
  const resources = new Map();
  let sequence = 0;

  // Share successful resources across article tabs; failures can be retried individually.
  function resource(kind, url) {
    if (resources.has(kind)) return resources.get(kind);
    if (kind === 'script' && typeof window.Artalk?.init === 'function') return Promise.resolve();
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(kind === 'script' ? 'script' : 'link');
      let timer;
      const finish = error => {
        clearTimeout(timer); node.onload = node.onerror = null;
        if (error) { node.remove(); reject(error); } else resolve();
      };
      node.dataset.artalkResource = kind;
      node.onload = () => finish(kind === 'script' && typeof window.Artalk?.init !== 'function' ? new Error('Missing Artalk') : null);
      node.onerror = () => finish(new Error('Artalk resource failed'));
      timer = setTimeout(() => finish(new Error('Artalk resource timeout')), 15000);
      if (kind === 'script') { node.src = url; node.async = true; }
      else { node.rel = 'stylesheet'; node.href = url; }
      document.head.append(node);
    }).catch(error => { resources.delete(kind); throw error; });
    resources.set(kind, promise);
    return promise;
  }
  function assets() {
    return Promise.all([
      resource('style', httpURL(config.css) || server + '/dist/Artalk.css'),
      resource('script', httpURL(config.js) || server + '/dist/Artalk.js')
    ]);
  }

  function createPageviews(article) {
    const label = article.querySelector('[data-article-pageviews]');
    const count = label?.querySelector('[data-pageviews-count]');
    if (config.pageview !== true || !count) return null;
    let requested = false, destroyed = false, controller;
    async function visit() {
      if (requested || destroyed || !article.isConnected) return;
      requested = true; controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(server + '/api/v2/pages/pv', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            page_key: article.dataset.commentKey,
            page_title: article.dataset.commentTitle || article.dataset.title || '',
            site_name: config.site
          }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Page view request failed');
        const data = await response.json();
        if (destroyed || controller.signal.aborted || !article.isConnected || !Number.isSafeInteger(data.pv) || data.pv < 0) return;
        count.textContent = data.pv.toLocaleString('zh-CN'); label.hidden = false;
      } catch {
        // Unknown counts stay hidden. Do not retry a write whose outcome is
        // uncertain: switching tabs or restoring a window is not another visit.
      } finally { clearTimeout(timeout); }
    }
    return {
      setActive(value) { if (value) visit(); },
      destroy() { destroyed = true; controller?.abort(); }
    };
  }

  function createComments({article, scroll, theme = 'light'}) {
    if (config.enable !== true || !server || !config.site || article.dataset.comments === 'false' || !article.dataset.commentKey) return null;
    const section = document.createElement('section'); section.className = 'article-comments';
    const heading = document.createElement('h2'); heading.id = 'article-comments-title-' + ++sequence; heading.textContent = '评论';
    section.setAttribute('aria-labelledby', heading.id);
    const status = document.createElement('div'); status.className = 'article-comments-status'; status.setAttribute('role', 'status');
    const message = document.createElement('span'); message.textContent = '评论将在阅读到此处时加载';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试'; retry.hidden = true;
    const mount = document.createElement('div'); mount.className = 'article-comments-mount';
    status.append(message, retry); section.append(heading, status, mount); scroll.append(section);
    let active = false, near = false, pending = false, failed = false, destroyed = false, instance, observer;
    const available = () => !destroyed && active && near && section.isConnected;
    function failure() {
      failed = true; status.hidden = false; retry.hidden = false;
      message.textContent = '评论加载失败，请检查连接后重试。';
    }
    async function start() {
      if (!available() || instance || pending || failed) return;
      pending = true; section.setAttribute('aria-busy', 'true');
      message.textContent = '正在加载评论…'; retry.hidden = true;
      try {
        await assets();
        // A different article may now be selected, or the tab may have been closed.
        if (!available()) return;
        const options = {
          server,
          site: config.site,
          pageKey: article.dataset.commentKey,
          pageTitle: article.dataset.commentTitle || article.dataset.title || '',
          locale: config.locale || 'zh-CN',
          placeholder: config.placeholder || '留下你的想法…',
          scrollRelativeTo: () => scroll,
          // Counts must not update another article tab through a global selector.
          pvEl: ':not(*)', countEl: ':not(*)',
          // The article header records the visit before comments are needed.
          pvAdd: false,
          imgLazyLoad: 'native'
        };
        const current = window.Artalk.init({
          el: mount, ...options, darkMode: theme === 'dark',
          // Artalk 2.9 prefers remote UI settings. Apply explicit theme options
          // before the editor renders, retaining backend auth/upload plugins.
          remoteConfModifier(remote) { Object.assign(remote, options, {darkMode: theme === 'dark'}); }
        });
        instance = current;
        // Artalk 2.9 may finish its own async initialization after destroy().
        // Run cleanup after all plugin handlers have finished mounting, too.
        let cleanupQueued = false, listRequested = false;
        const cleanupLate = () => {
          if (!destroyed || cleanupQueued) return;
          cleanupQueued = true;
          queueMicrotask(() => { cleanupQueued = false; current.destroy(); });
        };
        current.on('mounted', () => {
          if (destroyed) { cleanupLate(); return; }
          current.update({...options, darkMode: theme === 'dark'});
          // 2.9 skips its initial list request when remoteConfModifier is used.
          // Defer so versions that load automatically do not fetch twice.
          queueMicrotask(() => { if (!destroyed && !listRequested) current.reload(); });
        });
        current.on('list-fetch', () => { listRequested = true; });
        current.on('list-loaded', cleanupLate);
        status.hidden = true; observer?.disconnect();
      } catch {
        if (!destroyed) failure();
      } finally {
        pending = false; section.removeAttribute('aria-busy');
      }
    }
    retry.addEventListener('click', () => { failed = false; start(); });
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        near = entries.some(entry => entry.isIntersecting);
        start();
      }, {root: scroll, rootMargin: '300px 0px'});
      observer.observe(section);
    } else near = true;
    return {
      setActive(value) { active = value; if (active) start(); },
      setTheme(value) { theme = value; instance?.setDarkMode(theme === 'dark'); },
      destroy() {
        destroyed = true; active = false; observer?.disconnect();
        instance?.destroy(); instance = null; section.remove();
      }
    };
  }
  function create(options) {
    const {article} = options;
    if (config.enable !== true || !server || !config.site || !article.dataset.commentKey) return null;
    const pageviews = createPageviews(article), comments = createComments(options);
    if (!pageviews && !comments) return null;
    return {
      setActive(value) { pageviews?.setActive(value); comments?.setActive(value); },
      setTheme(value) { comments?.setTheme(value); },
      destroy() { pageviews?.destroy(); comments?.destroy(); }
    };
  }
  window.blanktimeComments = {create};
})();
