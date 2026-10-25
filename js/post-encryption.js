(() => {
  'use strict';
  const bundles = new Map();
  const selector = '[data-hbe-format]';

  function prepare(article) {
    const container = article.querySelector(selector);
    if (!container) return false;
    article.dataset.encrypted = 'true';
    const content = article.querySelector('.post-content');
    const script = content.querySelector('script[data-pjax][src]');
    try {
      const url = new URL(script?.getAttribute('src'), article.dataset.url);
      if (url.origin === location.origin && /\/lib\/hbe\.[a-f0-9]{10}\.js$/.test(url.pathname)) {
        container.dataset.bundle = url.href;
      }
    } catch {}
    // Use the plugin's crypto/runtime, with our own window-aware presentation.
    script?.remove();
    content.querySelectorAll('link[href]').forEach(link => {
      if (/\/css\/hbe\.style\.css(?:[?#]|$)/.test(link.getAttribute('href'))) link.remove();
    });
    // HBE's persisted key IDs depend on the current route and DOM order. Both
    // change independently of this article in a multi-tab desktop browser.
    container.dataset.autoSave = 'false';
    const input = container.querySelector('input[type=password]');
    if (input) {
      input.autocomplete = 'off';
      input.setAttribute('aria-label', '文章访问密码');
      input.placeholder = '输入密码';
    }
    container.querySelector('form')?.addEventListener('submit', event => event.preventDefault());
    return true;
  }

  function loadBundle(url) {
    if (window.hexoBlogEncrypt) return Promise.resolve();
    if (bundles.has(url)) return bundles.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.async = true;
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Encryption runtime timed out')), 15000);
      script.onload = () => finish(window.hexoBlogEncrypt ? null : new Error('Missing encryption runtime'));
      script.onerror = () => finish(new Error('Encryption runtime unavailable'));
      document.head.append(script);
    });
    bundles.set(url, promise);
    promise.catch(() => bundles.delete(url));
    return promise;
  }

  function mount(article, {signal, onUnlock}) {
    const container = article.querySelector(selector);
    if (!container) return;
    let unlocked = false;
    window.addEventListener('hexo-blog-decrypt', event => {
      const element = event.detail?.element;
      if (unlocked || signal.aborted || !article.isConnected || element?.closest('[data-article]') !== article) return;
      unlocked = true;
      article.dataset.encrypted = 'false';
      onUnlock(element);
    }, {signal});

    async function start() {
      const button = container.querySelector('.hbe-button');
      const error = container.querySelector('[role=alert]');
      button.disabled = true;
      container.setAttribute('aria-busy', 'true');
      error.textContent = '';
      try {
        if (!container.dataset.bundle) throw new Error('Missing encryption bundle');
        await loadBundle(container.dataset.bundle);
        if (signal.aborted || !article.isConnected) return;
        window.hexoBlogEncrypt.init(article);
      } catch {
        if (signal.aborted || !article.isConnected) return;
        error.textContent = '解锁组件加载失败。';
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'encryption-retry'; retry.textContent = '重试';
        retry.addEventListener('click', start); error.append(retry);
      } finally {
        button.disabled = false;
        container.removeAttribute('aria-busy');
      }
    }
    start();
  }

  window.blanktimeEncryption = {prepare, mount};
})();
