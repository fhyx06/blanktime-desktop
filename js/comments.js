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

  // Share successful resources across comment threads; failures can be retried individually.
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

  function createCommentThread({mount, scroll, pageKey, pageTitle = '', heading = '留言板', placeholder, theme = 'light', lazy = false}, standalone = false) {
    if (config.enable !== true || !server || !config.site || !mount || !scroll || !pageKey) return null;
    const section = document.createElement('section'); section.className = 'article-comments';
    const title = document.createElement('h2'); title.id = 'article-comments-title-' + ++sequence; title.textContent = heading;
    section.setAttribute('aria-labelledby', title.id);
    const status = document.createElement('div'); status.className = 'article-comments-status'; status.setAttribute('role', 'status');
    const message = document.createElement('span'); message.textContent = lazy ? '评论将在阅读到此处时加载' : '打开后加载留言';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试'; retry.hidden = true;
    let commentsMount = document.createElement('div'); commentsMount.className = 'article-comments-mount';
    commentsMount.hidden = standalone;
    status.append(message, retry); section.append(title, status, commentsMount); mount.append(section);
    let active = false, near = !lazy, pending = false, failed = false, destroyed = false, instance, observer;
    let draft = '';
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
        // A different view may now be selected, or the owning window may have closed.
        if (!available()) return;
        const options = {
          server,
          site: config.site,
          pageKey,
          pageTitle,
          locale: config.locale || 'zh-CN',
          placeholder: placeholder ?? (config.placeholder || '留下你的想法…'),
          scrollRelativeTo: () => scroll,
          // Counts must not update another thread through a global selector.
          pvEl: ':not(*)', countEl: ':not(*)',
          // Article headers count their own visits; standalone threads do not.
          pvAdd: false,
          imgLazyLoad: 'native'
        };
        const current = window.Artalk.init({
          el: commentsMount, ...options, darkMode: theme === 'dark',
          // Artalk 2.9 prefers remote UI settings. Apply explicit theme options
          // before the editor renders, retaining backend auth/upload plugins.
          remoteConfModifier(remote) { Object.assign(remote, options, {darkMode: theme === 'dark'}); }
        });
        instance = current;
        let retired = false, draftEvents;
        const isolateDraft = () => {
          if (!standalone) return true;
          const editor = current.ctx?.get?.('editor'), events = editor?.getPlugs?.()?.getEvents?.();
          if (events && events === draftEvents) return true;
          if (!Array.isArray(events?.events) || typeof events.off !== 'function' || typeof events.on !== 'function' ||
              typeof editor?.getContentRaw !== 'function' || typeof editor?.setContent !== 'function') return false;
          // Artalk 2.9 hardcodes a shared ArtalkContent storage key and exposes
          // no draft option or callback owner. Match its one save callback only;
          // incompatible SDKs fail closed instead of sharing another thread's draft.
          const saves = events.events.filter(event => event.name === 'content-updated' && typeof event.handler === 'function' &&
            /\bthis\.save\s*\(/.test(Function.prototype.toString.call(event.handler)));
          if (saves.length !== 1) return false;
          events.off('content-updated', saves[0].handler);
          events.on('content-updated', () => { if (!destroyed && !retired) draft = editor.getContentRaw(); });
          draftEvents = events;
          editor.setContent(draft);
          return true;
        };
        const incompatibleDraft = () => {
          retired = true; commentsMount.hidden = true;
          current.destroy(); if (instance === current) instance = null;
          // Retrying gets a fresh host so a retired SDK's late cleanup cannot
          // erase the replacement editor.
          const replacement = document.createElement('div');
          replacement.className = 'article-comments-mount'; replacement.hidden = true;
          commentsMount.replaceWith(replacement); commentsMount = replacement;
          failure(); message.textContent = '评论组件暂不兼容独立草稿，请更新组件后重试。';
        };
        // Artalk 2.9 handles every global comment hash in every instance and
        // fetches by ID without checking its page key. Standalone boards keep
        // their normal list/replies, but leave automatic anchor jumps to articles.
        const isolateAnchors = () => {
          if (!standalone || typeof current.off !== 'function') return;
          // 2.9 requires the original callback for off(); off(event) is a no-op.
          const handlers = current.ctx?.events?.events;
          if (!Array.isArray(handlers)) return;
          handlers.filter(event => event.name === 'list-goto' && typeof event.handler === 'function')
            .forEach(event => current.off(event.name, event.handler));
        };
        isolateAnchors();
        // Artalk 2.9 may finish its own async initialization after destroy().
        // Run cleanup after all plugin handlers have finished mounting, too.
        let cleanupQueued = false, listRequested = false;
        const cleanupLate = () => {
          if ((!destroyed && !retired) || cleanupQueued) return;
          cleanupQueued = true;
          queueMicrotask(() => { cleanupQueued = false; current.destroy(); });
        };
        current.on('updated', () => {
          if (!destroyed && !retired && !isolateDraft()) incompatibleDraft();
        });
        current.on('mounted', () => {
          if (destroyed || retired) { cleanupLate(); return; }
          isolateAnchors();
          if (!isolateDraft()) { incompatibleDraft(); return; }
          current.update({...options, darkMode: theme === 'dark'});
          // 2.9 skips its initial list request when remoteConfModifier is used.
          // Defer so versions that load automatically do not fetch twice.
          queueMicrotask(() => { if (!destroyed && !retired && !listRequested) current.reload(); });
          if (!retired) { commentsMount.hidden = false; status.hidden = true; }
        });
        current.on('list-fetch', () => { listRequested = true; });
        current.on('list-loaded', cleanupLate);
        if (!standalone) status.hidden = true;
        observer?.disconnect();
      } catch {
        if (!destroyed) failure();
      } finally {
        pending = false; section.removeAttribute('aria-busy');
      }
    }
    retry.addEventListener('click', () => { failed = false; start(); });
    if (lazy && 'IntersectionObserver' in window) {
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
  function createThread(options) {
    return createCommentThread(options, true);
  }
  function createComments({article, scroll, theme = 'light'}) {
    if (article.dataset.comments === 'false') return null;
    return createCommentThread({
      mount: scroll, scroll, theme, lazy: true, heading: '评论',
      pageKey: article.dataset.commentKey,
      pageTitle: article.dataset.commentTitle || article.dataset.title || ''
    });
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
  window.blanktimeComments = {create, createThread};
})();
