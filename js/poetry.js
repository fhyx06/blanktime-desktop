(() => {
  'use strict';
  const poem = document.getElementById('welcome-poem');
  const welcome = document.getElementById('welcome');
  const refresh = document.getElementById('poem-refresh');
  const feedback = document.getElementById('poem-feedback');
  if (!poem || !welcome || poem.dataset.enabled !== 'true' || !refresh) return;
  let started = false;
  let busy = false;
  let sdkPromise;
  function loadSDK() {
    if (window.jinrishici?.load) return Promise.resolve(window.jinrishici);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(fail, 8000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(new Error('SDK unavailable'));
      }
      script.src = 'https://sdk.jinrishici.com/v2/browser/jinrishici.js';
      script.async = true;
      script.onerror = fail;
      script.onload = () => {
        if (!window.jinrishici?.load) { fail(); return; }
        clearTimeout(timer);
        resolve(window.jinrishici);
      };
      document.head.append(script);
    }).catch(error => { sdkPromise = null; throw error; });
    return sdkPromise;
  }
  function requestPoem(sdk) {
    return new Promise((resolve, reject) => {
      // The official SDK has no error callback; bound each request ourselves.
      const timer = setTimeout(() => reject(new Error('Request timed out')), 8000);
      try {
        sdk.load(result => {
          clearTimeout(timer);
          if (typeof result?.data?.content !== 'string' || !result.data.content.trim()) {
            reject(new Error('Empty poem'));
          } else resolve(result.data);
        });
      } catch (error) { clearTimeout(timer); reject(error); }
    });
  }
  async function refreshPoem(manual = false) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    refresh.textContent = '加载中…';
    poem.setAttribute('aria-busy', 'true');
    poem.dataset.status = 'loading';
    feedback.textContent = '';
    try {
      const sdk = await loadSDK();
      let data = await requestPoem(sdk);
      if (manual && data.content.trim() === poem.textContent.trim()) data = await requestPoem(sdk);
      const repeated = manual && data.content.trim() === poem.textContent.trim();
      poem.textContent = data.content.trim();
      poem.dataset.status = 'live';
      poem.title = data.origin ? [data.origin.dynasty, data.origin.author, data.origin.title ? '《' + data.origin.title + '》' : ''].filter(Boolean).join(' · ') : '';
      if (repeated) feedback.textContent = '暂时还是这句，稍后再试';
    } catch {
      poem.dataset.status = 'fallback';
      feedback.textContent = '暂时未能获取，点击重试';
    } finally {
      busy = false;
      refresh.disabled = false;
      refresh.textContent = '换一句';
      poem.removeAttribute('aria-busy');
    }
  }
  refresh.addEventListener('click', () => refreshPoem(true));
  function start() {
    if (started || welcome.hidden) return;
    started = true;
    observer.disconnect();
    refreshPoem();
  }
  const observer = new MutationObserver(start);
  observer.observe(welcome, {attributes: true, attributeFilter: ['hidden']});
  start();
})();
